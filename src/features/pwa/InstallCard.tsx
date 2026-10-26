import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/field';
import { LogoMark } from '@/components/brand/Logo';
import { closeInstallPrompt, shouldShowInstallPrompt } from './install';
import { InstallInstructions } from './InstallInstructions';

/**
 * Tarjeta inicial "Lleva REFRUN contigo". Se muestra tras entrar en la app si:
 *  - no se ejecuta ya como app instalada;
 *  - el usuario no marcó "No volver a mostrar" en este navegador;
 *  - no se cerró en los últimos días (aplazamiento moderado).
 * No bloquea la navegación: se puede cerrar con la X, Escape o el botón.
 */
export function InstallCard() {
  const [open, setOpen] = useState(() => shouldShowInstallPrompt());
  const [dontShow, setDontShow] = useState(false);

  const close = () => {
    closeInstallPrompt(dontShow);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      title={
        <span className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl border border-border bg-bg">
            <LogoMark className="size-9" />
          </span>
          Lleva REFRUN contigo
        </span>
      }
      description="Añádela a la pantalla de inicio y ábrela como una app más: a pantalla completa y con un toque."
      footer={
        <>
          <div className="mr-auto flex items-center sm:pt-2">
            <Checkbox label="No volver a mostrar" checked={dontShow} onChange={setDontShow} />
          </div>
          <Button variant="secondary" onClick={close}>
            Cerrar
          </Button>
        </>
      }
    >
      <InstallInstructions />
    </Dialog>
  );
}
