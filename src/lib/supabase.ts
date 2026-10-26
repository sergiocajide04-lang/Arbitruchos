import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase. Solo usa valores PÚBLICOS (URL + clave publicable/anon).
 * La protección de los datos la garantizan las políticas RLS de la base de datos.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = url.startsWith('https://') && key.length > 20;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no está configurado (faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY).');
  }
  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
        storageKey: 'refrun-auth',
      },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}

/** URL absoluta de una ruta de la app (respeta la ruta base de GitHub Pages). */
export function appUrl(path = ''): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${window.location.origin}${base}${path.replace(/^\//, '')}`;
}
