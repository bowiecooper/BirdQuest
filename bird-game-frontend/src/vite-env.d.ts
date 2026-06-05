/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Base URL of the FastAPI inference service (used in Phase 2). */
  readonly VITE_INFERENCE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
