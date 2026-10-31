/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Nombre antiguo, admitido por compatibilidad. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BASE?: string;
  /** Clave PÚBLICA VAPID para Web Push (la privada solo existe en el servidor de envío). */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
