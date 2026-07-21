/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_AMAP_JS_KEY: string;
  readonly VITE_AMAP_SECURITY_CODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
