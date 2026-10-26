import { RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

/**
 * Actualización controlada: la nueva versión se descarga en segundo plano y solo
 * se activa cuando el usuario pulsa "Actualizar" (se recarga entera, sin mezclar
 * archivos de versiones distintas). Comprueba novedades cada hora.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('Service worker', error);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast.success('REFRUN está lista para abrirse sin conexión.');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-accent/40 bg-surface p-3 pl-4 shadow-glow animate-slide-up lg:bottom-6"
    >
      <RefreshCw className="size-5 shrink-0 text-accent-text" aria-hidden />
      <p className="flex-1 text-sm">Hay una nueva versión de REFRUN.</p>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Luego
      </Button>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Actualizar
      </Button>
    </div>
  );
}
