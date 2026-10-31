/*
 * REFRUN · gestor de notificaciones push. Lo importa el service worker generado
 * (workbox.importScripts en vite.config.ts). Solo muestra lo que envía el
 * servidor de notificaciones; no guarda nada.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const scope = self.registration.scope;
  const title = data.title || 'REFRUN';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'refrun',
      icon: new URL('icons/icon-192.png', scope).href,
      badge: new URL('icons/icon-192.png', scope).href,
      lang: 'es',
      data: { url: new URL(data.path || '', scope).href },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.registration.scope) && 'focus' in w) {
          if ('navigate' in w) w.navigate(target).catch(() => undefined);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
