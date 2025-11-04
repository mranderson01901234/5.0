import { readSSE } from "../lib/sse";
import { handleApiError } from '@/utils/handleApiError';
import { log } from '@/utils/logger';
import type { MessagesResponse, SendMessageRequest, SendMessageResponse } from '@/types/api';
import { getEnv } from '@/utils/env';
import { httpJson } from '@/utils/http';
import { withRetry } from '@/utils/retry';
import { classifyFetchError, friendlyMessage } from '@/utils/errorClassify';

const { VITE_API_BASE_URL } = getEnv();
// Normalize baseUrl: if it's just "/", keep it; otherwise remove trailing slash
// This prevents double slashes when constructing URLs like `${baseUrl}/v1/...`
const baseUrl = VITE_API_BASE_URL === '/' 
  ? '' // Empty string for relative URLs, so `/v1/...` becomes `/v1/...` not `//v1/...`
  : (VITE_API_BASE_URL.endsWith('/') ? VITE_API_BASE_URL.slice(0, -1) : VITE_API_BASE_URL);

function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type":"application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function retryOnGet(e: unknown) {
  // @ts-expect-error possible status on Error
  const status: number | undefined = e?.status;
  // retry on network, timeout, 5xx, 429
  if (e instanceof DOMException && e.name === 'AbortError') return false;
  if (e instanceof Error && /timeout/i.test(e.message)) return true;
  if (e instanceof TypeError) return true;
  if (typeof status === 'number') return status >= 500 || status === 429;
  return true;
}

export async function fetchMessages(conversationId: string, token?: string): Promise<MessagesResponse> {
  try {
    return await withRetry(async () => {
      const { data } = await httpJson<{ messages?: unknown[] }>(
        `${baseUrl}/v1/conversations/${conversationId}/messages`,
        {
          method: 'GET',
          headers: getHeaders(token),
        }
      );
      // Transform to MessagesResponse format
      const items = (data.messages || []).map((msg: unknown) => {
        if (msg && typeof msg === 'object' && 'id' in msg && 'role' in msg && 'content' in msg) {
          return {
            id: String(msg.id),
            role: msg.role as 'user' | 'assistant' | 'system',
            content: String(msg.content),
            ts: 'created_at' in msg && typeof msg.created_at === 'number' ? msg.created_at : Date.now(),
          };
        }
        throw new Error('Invalid message format');
      });
      return { items };
    }, { retries: 3, baseMs: 300, jitter: true, retryOn: retryOnGet });
  } catch (e) {
    // @ts-expect-error status possibly attached
    const status = e?.status as number | undefined;
    const cls = classifyFetchError(e, status);
    return handleApiError(new Error(friendlyMessage(cls)), { action: 'loading messages' });
  }
}

export async function sendMessage(payload: SendMessageRequest, token?: string): Promise<SendMessageResponse> {
  try {
    // Note: sendMessage is legacy - streamChat should be used for actual sending
    // For now, return a queued response since streaming starts immediately
    // In a real implementation, this might return an ID from a queued message endpoint
    return { id: `msg-${Date.now()}`, queued: true };
  } catch (e) {
    // No retries for POST by default
    // @ts-expect-error status possibly attached
    const status = e?.status as number | undefined;
    const cls = classifyFetchError(e, status);
    return handleApiError(new Error(friendlyMessage(cls)), { action: 'sending message' });
  }
}

log.debug('gateway typed');

export async function streamChat(payload:{
  threadId:string; messages:{role:string;content:string}[]; provider?:string; model?:string;
}, token?: string){
  try {
    const url = `${baseUrl}/v1/chat/stream`;
    const headers = getHeaders(token);
    // Gateway expects camelCase
    const apiPayload = {
      threadId: payload.threadId,
      messages: payload.messages,
      provider: payload.provider,
      model: payload.model,
    };
    const resp = await fetch(url, {
      method:"POST",
      headers,
      body: JSON.stringify(apiPayload)
    });
    if(!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}: stream failed`);
    let firstAt:number|undefined;
    async function* chunks(){
      for await (const frame of readSSE(resp)){
        const lines = frame.split("\n");
        const evLine = lines.find(l=>l.startsWith("event:"));
        const ev = evLine ? evLine.slice(6).trim() : "delta";
        // Map 'token' events to 'delta' for consistency
        const mappedEv = ev === "token" ? "delta" : ev;
        const dataLine = lines.find(l=>l.startsWith("data:"));
        const dataStr = dataLine ? dataLine.slice(5).trim() : "";
        
        // Debug logging for research and thinking events
        if (mappedEv === "research_summary" || mappedEv === "sources" || mappedEv === "research_thinking" || mappedEv === "thinking_step") {
          log.debug('[gateway.ts] SSE event received:', {
            event: mappedEv,
            rawEvent: ev,
            dataStr: dataStr.substring(0, 200),
            hasData: !!dataStr
          });
        }
        
        // Skip empty data (like heartbeat events), but include error events
        // IMPORTANT: Don't skip research_summary, sources, thinking_step even if data is empty initially
        if(!dataStr && mappedEv !== "error" && mappedEv !== "research_summary" && mappedEv !== "sources" && mappedEv !== "research_thinking" && mappedEv !== "thinking_step") continue;
        
        let data;
        try {
          data = dataStr ? JSON.parse(dataStr) : {};
        } catch {
          // If parsing fails, use the raw string
          data = dataStr;
        }
        
        if(firstAt===undefined && (mappedEv==="delta" || mappedEv==="preface")) firstAt=performance.now();
        yield { ev: mappedEv, data };
        if(mappedEv==="done" || mappedEv==="error") break;
      }
    }
    return { firstAtGetter: ()=>firstAt, stream: chunks() };
  } catch (err) {
    handleApiError(err, {
      action: 'starting chat stream',
      fallbackMessage: 'Stream connection failed.',
    });
  }
}

export async function getConversations(token?: string): Promise<unknown[]> {
  try {
    const url = `${baseUrl}/v1/conversations`;
    const headers = getHeaders(token);
    const resp = await fetch(url, { method:"GET", headers });
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await json<{ conversations?: unknown[] }>(resp);
    return data.conversations || [];
  } catch (err: unknown) {
    handleApiError(err, {
      action: 'loading conversations',
      fallbackMessage: 'Unable to load conversations. Try again.',
    });
  }
}

export async function getConversationMessages(threadId: string, token?: string) {
  try {
    if (!threadId) throw new Error('threadId required');
    const url = `${baseUrl}/v1/conversations/${threadId}/messages`;
    const headers = getHeaders(token);
    const resp = await fetch(url, { method:"GET", headers });
    if(!resp.ok) {
      // 404 is expected for deleted/non-existent conversations - don't log as error
      if (resp.status === 404) {
        const notFoundError = new Error(`HTTP ${resp.status}`);
        (notFoundError as { isNotFound?: boolean }).isNotFound = true;
        throw notFoundError;
      }
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await json<{ messages?: unknown[] }>(resp);
    return data.messages || [];
  } catch (err: unknown) {
    // Don't log 404s as errors or show toasts - they're expected for missing conversations
    if (err instanceof Error && 'isNotFound' in err && (err as { isNotFound?: boolean }).isNotFound) {
      throw err;
    }
    handleApiError(err, {
      action: 'loading messages',
      fallbackMessage: 'Unable to load messages. Try again.',
    });
  }
}

export async function deleteConversation(threadId: string, token?: string): Promise<void> {
  try {
    if (!threadId) throw new Error('threadId required');
    const url = `${baseUrl}/v1/conversations/${threadId}`;
    // DELETE requests don't need Content-Type header when there's no body
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const resp = await fetch(url, { method:"DELETE", headers });
    if(!resp.ok) {
      // Try to get error details from response
      let errorMessage = `HTTP ${resp.status}`;
      try {
        const errorData = await resp.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage);
    }
  } catch (err: unknown) {
    handleApiError(err, {
      action: 'deleting conversation',
      fallbackMessage: 'Failed to delete conversation.',
    });
  }
}

/**
 * Create an artifact
 */
export async function createArtifact(
  payload: {
    threadId: string;
    type: "table" | "doc" | "sheet";
    data: unknown;
    metadata?: Record<string, unknown>;
  },
  token?: string
): Promise<{
  id: string;
  threadId: string;
  type: "table" | "doc" | "sheet";
  data: unknown;
  metadata?: Record<string, unknown>;
  createdAt: number;
}> {
  try {
    const url = `${baseUrl}/api/artifacts/create`;
    const headers = getHeaders(token);
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await json(resp);
  } catch (err: unknown) {
    handleApiError(err, {
      action: 'creating artifact',
      fallbackMessage: 'Failed to create artifact.',
    });
  }
}

/**
 * Get all artifacts for a thread
 */
export async function getArtifacts(
  threadId: string,
  token?: string
): Promise<{
  artifacts: Array<{
    id: string;
    threadId: string;
    type: "table" | "doc" | "sheet";
    data: unknown;
    metadata?: Record<string, unknown>;
    createdAt: number;
  }>;
}> {
  try {
    const url = `${baseUrl}/api/artifacts/${threadId}`;
    const headers = getHeaders(token);
    const resp = await fetch(url, { method: "GET", headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await json(resp);
  } catch (err: unknown) {
    handleApiError(err, {
      action: 'loading artifacts',
      fallbackMessage: 'Failed to load artifacts.',
    });
  }
}

/**
 * Get export job status
 */
export async function getExportStatus(
  exportId: string,
  token?: string
): Promise<{
  id: string;
  artifactId: string;
  format: "pdf" | "docx" | "xlsx";
  url: string;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: number;
}> {
  try {
    const url = `${baseUrl}/api/exports/status/${exportId}`;
    const headers = getHeaders(token);
    const resp = await fetch(url, { method: "GET", headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await json(resp);
  } catch (err: unknown) {
    handleApiError(err, {
      action: 'checking export status',
      fallbackMessage: 'Failed to check export status.',
    });
  }
}

/**
 * Export an artifact to PDF/DOCX/XLSX
 */
export async function exportArtifact(
  payload: {
    artifactId: string;
    format: "pdf" | "docx" | "xlsx";
  },
  token?: string
): Promise<{
  id: string;
  artifactId: string;
  format: "pdf" | "docx" | "xlsx";
  url: string;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: number;
}> {
  try {
    const url = `${baseUrl}/api/artifacts/export`;
    const headers = getHeaders(token);
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await json(resp);
  } catch (err: unknown) {
    handleApiError(err, {
      action: 'exporting artifact',
      fallbackMessage: 'Failed to export artifact.',
    });
  }
}

/**
 * Delete an artifact
 */
export async function deleteArtifact(
  artifactId: string,
  token?: string
): Promise<void> {
  try {
    const url = `${baseUrl}/api/artifacts/${artifactId}`;
    const headers = getHeaders(token);
    const resp = await fetch(url, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch (err: unknown) {
    handleApiError(err, {
      action: 'deleting artifact',
      fallbackMessage: 'Failed to delete artifact.',
    });
  }
}

