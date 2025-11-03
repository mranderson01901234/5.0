/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
  readonly VITE_ERROR_REPORT_URL?: string
  readonly VITE_DEV_PORT?: string
  readonly VITE_PREVIEW_PORT?: string
  // Legacy (deprecated)
  readonly VITE_GATEWAY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*?worker' {
  const workerConstructor: { new(): Worker };
  export default workerConstructor;
}
