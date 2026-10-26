import { Download, MoreVertical, PlusSquare, Share } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/misc';
import { detectPlatform, triggerNativeInstall, useDeferredInstallPrompt, useIsStandalone, type Platform } from './install';

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-bold text-accent-text">{n}</span>
      <span className="pt-0.5 text-sm leading-relaxed">{children}</span>
    </li>
  );
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <span className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">
    {children}
  </span>
);

/** Instrucciones de instalación para iPhone y Android (con botón nativo si el navegador lo permite). */
export function InstallInstructions({ initialPlatform }: { initialPlatform?: Platform }) {
  const detected = detectPlatform();
  const [platform, setPlatform] = useState<'ios' | 'android'>(
    initialPlatform === 'ios' || (initialPlatform === undefined && detected === 'ios') ? 'ios' : 'android',
  );
  const deferred = useDeferredInstallPrompt();
  const standalone = useIsStandalone();

  if (standalone) {
    return (
      <p className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">
        Ya estás usando REFRUN como aplicación instalada en este dispositivo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Segmented
        label="Sistema del móvil"
        value={platform}
        onChange={setPlatform}
        options={[
          { value: 'ios', label: 'iPhone' },
          { value: 'android', label: 'Android' },
        ]}
        className="w-full"
      />

      {platform === 'ios' ? (
        <ol className="space-y-3">
          <Step n={1}>
            Abre REFRUN en <strong>Safari</strong> (en iOS 16.4 o posterior también funciona desde Chrome o Edge).
          </Step>
          <Step n={2}>
            Pulsa el botón <Kbd><Share className="size-3.5" aria-hidden /> Compartir</Kbd> de la barra inferior o superior.
          </Step>
          <Step n={3}>
            Desliza y elige <Kbd><PlusSquare className="size-3.5" aria-hidden /> Añadir a pantalla de inicio</Kbd>.
          </Step>
          <Step n={4}>Confirma con «Añadir». El icono de REFRUN aparecerá junto a tus apps.</Step>
        </ol>
      ) : (
        <div className="space-y-3">
          {deferred && (
            <Button block onClick={() => void triggerNativeInstall()}>
              <Download aria-hidden /> Instalar REFRUN
            </Button>
          )}
          <ol className="space-y-3">
            <Step n={1}>Abre REFRUN en <strong>Chrome</strong> (o en el navegador de tu móvil).</Step>
            <Step n={2}>
              Pulsa el menú <Kbd><MoreVertical className="size-3.5" aria-hidden /></Kbd> de la esquina superior.
            </Step>
            <Step n={3}>
              Elige <Kbd>Instalar aplicación</Kbd> o <Kbd>Añadir a pantalla de inicio</Kbd>.
            </Step>
            <Step n={4}>Confirma. Podrás abrir REFRUN desde tu pantalla de inicio, a pantalla completa.</Step>
          </ol>
        </div>
      )}
      <p className="text-xs text-muted">
        Los pasos exactos dependen del navegador y su versión. Instalarla no es obligatoria: REFRUN funciona igual desde el navegador.
      </p>
    </div>
  );
}
