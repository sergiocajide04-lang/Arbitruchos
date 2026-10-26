import { ChevronLeft } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import brand from '@/config/brand.json';

/** Cabecera de página + título del documento (útil para lectores de pantalla e historial). */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Ruta a la que vuelve el botón atrás (o true para volver en el historial). */
  back?: string | true;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = `${title} · ${brand.name}`;
  }, [title]);
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <button
            type="button"
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
            className="-ml-1.5 mb-2 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 text-sm font-medium text-muted hover:text-fg"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Volver
          </button>
        )}
        <h1 className="font-display text-[32px] font-bold uppercase italic leading-none tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
