/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_'); // only VITE_ vars

  const cfg: ReturnType<typeof defineConfig> = {
    plugins: [react(), tsconfigPaths()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts', './src/setupTests.ts'],
        clearMocks: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@clerk/nextjs/server': path.resolve(__dirname, './src/test/mocks/clerk.ts'),
      },
    },
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      include: ['react-window'],
      esbuildOptions: {
        target: 'esnext',
      },
    },
    server: {
      port: Number(env.VITE_DEV_PORT ?? 5173),
      strictPort: false,
      host: true,
      open: false,
      watch: {
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/logs/**'],
        usePolling: false,
      },
      fs: {
        strict: false,
      },
      proxy: {
        '/v1': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
          ws: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              // eslint-disable-next-line no-console
              console.error('Vite proxy error:', err);
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Proxy error: ' + err.message);
              }
            });
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // Forward Authorization header
              if (req.headers.authorization) {
                proxyReq.setHeader('Authorization', req.headers.authorization);
              }
              // Don't buffer responses for streaming
              proxyReq.setHeader('Connection', 'keep-alive');
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              // For SSE endpoints, ensure proper headers
              if (req.url?.includes('/chat/stream')) {
                // Remove content-length for streaming
                proxyRes.headers['content-length'] = undefined;
                // Ensure connection is kept alive
                proxyRes.headers['connection'] = 'keep-alive';
              }
            });
          },
        },
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
          ws: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              // eslint-disable-next-line no-console
              console.error('Vite proxy error (API):', err);
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Proxy error: ' + err.message);
              }
            });
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // Forward Authorization header
              if (req.headers.authorization) {
                proxyReq.setHeader('Authorization', req.headers.authorization);
              }
            });
          },
        },
        '/ws': {
          target: 'ws://localhost:8787',
          ws: true,
          changeOrigin: true,
          secure: false,
        },
        '/openapi.json': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      port: Number(env.VITE_PREVIEW_PORT ?? 4173),
      strictPort: false,
    },
    build: {
      target: 'es2020',
      sourcemap: mode !== 'production',
      outDir: 'dist',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          mobile: resolve(__dirname, 'mobile.html'),
        },
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
          },
        },
      },
    },
    envPrefix: 'VITE_',
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
  };

  return cfg;
});

