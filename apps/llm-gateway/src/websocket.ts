/**
 * WebSocket Server for Telemetry Streaming
 * Provides real-time telemetry events with SSE fallback
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { logger } from './log.js';
import { telemetryStore, type TelemetryEvent } from './telemetry.js';

let wss: WebSocketServer | null = null;
const connectedClients = new Map<WebSocket, { userId: string; connectedAt: number }>();

/**
 * Authenticate WebSocket connection using Clerk session token
 */
async function authenticateWebSocket(token: string): Promise<{ userId: string } | null> {
  try {
    // Import Clerk SDK dynamically
    const { clerkClient } = await import('@clerk/clerk-sdk-node');
    
    // Verify token
    const session = await clerkClient.verifyToken(token);
    if (session && session.sub) {
      return { userId: session.sub };
    }
    return null;
  } catch (error: any) {
    logger.warn({ error: error.message }, 'WebSocket authentication failed');
    return null;
  }
}

/**
 * Initialize WebSocket server
 */
export function initializeWebSocketServer(server: Server): WebSocketServer | null {
  try {
    wss = new WebSocketServer({ 
      server,
      path: '/ws/telemetry',
    });

    wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token') || request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        logger.warn('WebSocket connection rejected: no token');
        ws.close(1008, 'Authentication required');
        return;
      }

      // Authenticate
      const auth = await authenticateWebSocket(token);
      if (!auth) {
        logger.warn('WebSocket connection rejected: invalid token');
        ws.close(1008, 'Authentication failed');
        return;
      }

      const { userId } = auth;
      connectedClients.set(ws, { userId, connectedAt: Date.now() });

      logger.info({ userId, clientCount: connectedClients.size }, 'WebSocket client connected');

      // Send initial connection event
      ws.send(JSON.stringify({
        event: 'connected',
        data: { timestamp: Date.now() },
      }));

      // Send recent events (last 50)
      telemetryStore.getRecentEvents(50).then(events => {
        events.forEach(event => {
          ws.send(JSON.stringify({
            event: 'telemetry',
            data: event,
          }));
        });
      }).catch(err => {
        logger.warn({ error: err.message }, 'Failed to send initial events');
      });

      // Subscribe to new events
      const unsubscribe = telemetryStore.subscribe((event: TelemetryEvent) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              event: 'telemetry',
              data: event,
            }));
          } catch (error) {
            logger.warn({ error }, 'Failed to send telemetry event to WebSocket client');
            unsubscribe();
            connectedClients.delete(ws);
          }
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        unsubscribe();
        connectedClients.delete(ws);
        logger.info({ userId, clientCount: connectedClients.size }, 'WebSocket client disconnected');
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error({ error, userId }, 'WebSocket error');
        unsubscribe();
        connectedClients.delete(ws);
      });

      // Send heartbeat every 30 seconds
      const heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              event: 'heartbeat',
              data: { timestamp: Date.now() },
            }));
          } catch (error) {
            clearInterval(heartbeatInterval);
            unsubscribe();
            connectedClients.delete(ws);
          }
        } else {
          clearInterval(heartbeatInterval);
          unsubscribe();
          connectedClients.delete(ws);
        }
      }, 30000);

      ws.on('close', () => {
        clearInterval(heartbeatInterval);
      });
    });

    logger.info('WebSocket server initialized on /ws/telemetry');
    return wss;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to initialize WebSocket server');
    return null;
  }
}

/**
 * Get WebSocket server instance
 */
export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}

/**
 * Get connected clients count
 */
export function getConnectedClientsCount(): number {
  return connectedClients.size;
}

/**
 * Close WebSocket server
 */
export async function closeWebSocketServer(): Promise<void> {
  if (wss) {
    // Close all connections
    connectedClients.forEach((_, ws) => {
      ws.close(1001, 'Server shutting down');
    });
    connectedClients.clear();

    // Close server
    return new Promise((resolve) => {
      wss!.close(() => {
        wss = null;
        logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}

