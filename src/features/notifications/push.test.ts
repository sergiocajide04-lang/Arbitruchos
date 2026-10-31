import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registerPushSubscription = vi.fn(async () => undefined);
vi.mock('@/services/api', () => ({ registerPushSubscription, deletePushSubscription: vi.fn(async () => undefined) }));

const { enablePush, pushSupport, urlBase64ToUint8Array } = await import('./push');

function stubNotification(permission: NotificationPermission, answer: NotificationPermission = permission) {
  const requestPermission = vi.fn(async () => answer);
  vi.stubGlobal('Notification', Object.assign(function Notification() {}, { permission, requestPermission }));
  return requestPermission;
}

function stubServiceWorker() {
  const subscription = {
    endpoint: 'https://push.example/abc',
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p'.repeat(40), auth: 'a'.repeat(16) } }),
  };
  const subscribe = vi.fn(async () => subscription);
  const registration = { pushManager: { getSubscription: vi.fn(async () => null), subscribe } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn(async () => registration) } });
  vi.stubGlobal('PushManager', function PushManager() {});
  return { subscribe };
}

describe('permiso y suscripción de notificaciones', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U');
    registerPushSubscription.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('si el usuario ya bloqueó las notificaciones, no se vuelve a pedir permiso', async () => {
    const request = stubNotification('denied');
    stubServiceWorker();
    expect(await enablePush()).toBe('denied');
    expect(request).not.toHaveBeenCalled();
    expect(registerPushSubscription).not.toHaveBeenCalled();
  });

  it('pide permiso solo al activarlas y registra el dispositivo si se concede', async () => {
    const request = stubNotification('default', 'granted');
    const { subscribe } = stubServiceWorker();
    expect(await enablePush()).toBe('enabled');
    expect(request).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(registerPushSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/abc' }));
  });

  it('si el usuario rechaza en el diálogo, no se suscribe', async () => {
    stubNotification('default', 'denied');
    const { subscribe } = stubServiceWorker();
    expect(await enablePush()).toBe('denied');
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('en iPhone sin instalar explica que hay que añadirla a la pantalla de inicio', () => {
    expect(pushSupport({ platform: 'ios', standalone: false })).toBe('needs-install');
  });

  it('sin clave pública VAPID no promete notificaciones', () => {
    stubNotification('default');
    stubServiceWorker();
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect(pushSupport({ platform: 'android', standalone: true })).toBe('unconfigured');
  });

  it('sin Web Push en el navegador lo indica', () => {
    vi.stubGlobal('PushManager', undefined);
    Reflect.deleteProperty(window, 'PushManager');
    expect(pushSupport({ platform: 'desktop', standalone: false })).toBe('unsupported');
  });

  it('convierte la clave VAPID a bytes', () => {
    expect(urlBase64ToUint8Array('AQID').length).toBe(3);
    expect([...urlBase64ToUint8Array('_-8')]).toEqual([255, 239]);
  });
});
