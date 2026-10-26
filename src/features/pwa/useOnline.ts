import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** Estado de conexión del navegador (orientativo: `true` no garantiza llegar al servidor). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
