import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Oculta el botón de cerrar de la esquina. */
  hideClose?: boolean;
}

/** Diálogo accesible (foco atrapado, Escape, aria). En móvil se muestra como hoja inferior. */
export function Dialog({ open, onOpenChange, title, description, children, footer, className, hideClose }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl data-[state=open]:animate-slide-up focus:outline-none',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pb-5',
            className,
          )}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : 'Diálogo'}</DialogPrimitive.Description>
              )}
            </div>
            {!hideClose && (
              <DialogPrimitive.Close
                className="-mr-1 -mt-1 rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg"
                aria-label="Cerrar ventana"
              >
                <X className="size-5" />
              </DialogPrimitive.Close>
            )}
          </div>
          {children}
          {footer && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
