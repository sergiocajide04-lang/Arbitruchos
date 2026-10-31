/**
 * Web Push en el navegador: compatibilidad, permiso y suscripción del dispositivo.
 * El permiso SOLO se pide cuando el usuario pulsa «Activar notificaciones».
 * La clave privada VAPID nunca está aquí: solo la pública (VITE_VAPID_PUBLIC_KEY).
 */
import { useCallback, useEffect, useState } from 'react';
import { deletePushSubscription, registerPushSubscription } from '@/services/api';
import { detectPlatform, isStandalone } from '@/features/pwa/install';

export type PushSupport =
  /** El navegador no tiene Web Push (o es un iPhone con iOS anterior a 16.4). */
  | 'unsupported'
  /** iPhone/iPad: Web Push solo funciona con la app añadida a la pantalla de inicio. */
  | 'needs-install'
  /** Falta la clave pública VAPID en esta publicación. */
  | 'unconfigured'
  | 'supported';

export type PushPermission = NotificationPermission | 'unsupported';

export function vapidPublicKey(): string | null {
  const k = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  return k ? k : null;
}

export function pushSupport(env: { standalone?: boolean; platform?: ReturnType<typeof detectPlatform> } = {}): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const platform = env.platform ?? detectPlatform();
  const standalone = env.standalone ?? isStandalone();
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // En iOS las APIs solo aparecen dentro de la app instalada (iOS 16.4+).
  if (platform === 'ios' && !standalone) return 'needs-install';
  if (!hasApis) return 'unsupported';
  if (!vapidPublicKey()) return 'unconfigured';
  return 'supported';
}

export function currentPermission(): PushPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Clave VAPID base64url → bytes (formato que pide PushManager.subscribe). */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export type EnableResult = 'enabled' | 'denied' | 'dismissed' | 'no-service-worker';

/**
 * Pide permiso (si aún no se ha decidido), suscribe el dispositivo y lo registra
 * en Supabase. Si el usuario ya lo denegó, NO se vuelve a preguntar.
 */
export async function enablePush(): Promise<EnableResult> {
  const key = vapidPublicKey();
  if (!key) throw new Error('Las notificaciones no están configuradas en esta publicación.');
  let permission = Notification.permission;
  if (permission === 'denied') return 'denied';
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'dismissed';

  const reg = await registration();
  if (!reg) return 'no-service-worker';
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('El navegador no devolvió una suscripción válida.');
  await registerPushSubscription({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent.slice(0, 300),
  });
  return 'enabled';
}

/** Da de baja este dispositivo (en el navegador y en Supabase). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  await deletePushSubscription(endpoint);
}

/** Estado reactivo del permiso y de la suscripción de este dispositivo. */
export function usePushState() {
  const [permission, setPermission] = useState<PushPermission>(() => currentPermission());
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    setPermission(currentPermission());
    try {
      setSubscribed(!!(await currentSubscription()));
    } catch {
      setSubscribed(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { permission, subscribed, refresh };
}
