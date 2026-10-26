import brand from '@/config/brand.json';
import { cn } from '@/lib/utils';

const { mark } = brand;

/** Símbolo de REFRUN: cronómetro abierto con líneas de velocidad. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const { hub, crownStem: s, crownCap: c } = mark;
  return (
    <svg
      viewBox={mark.viewBox}
      className={cn('text-accent', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect x={s.x} y={s.y} width={s.width} height={s.height} fill="currentColor" />
      <rect x={c.x} y={c.y} width={c.width} height={c.height} rx={c.rx} fill="currentColor" />
      <path d={mark.ring} fill="none" stroke="currentColor" strokeWidth={mark.ringWidth} strokeLinecap="round" />
      {mark.speedLines.map((d) => (
        <path key={d} d={d} fill="none" className="stroke-fg" strokeWidth={mark.speedLineWidth} strokeLinecap="round" />
      ))}
      <path d={mark.hand} fill="none" stroke="currentColor" strokeWidth={mark.handWidth} strokeLinecap="round" />
      <circle cx={hub.cx} cy={hub.cy} r={hub.r} fill="currentColor" />
      <circle cx={hub.cx} cy={hub.cy} r={hub.innerR} className="fill-bg" />
    </svg>
  );
}

/** Logotipo horizontal: símbolo + "REF" "RUN". */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = {
    sm: { mark: 'size-7', text: 'text-xl' },
    md: { mark: 'size-9', text: 'text-[26px]' },
    lg: { mark: 'size-14', text: 'text-[44px]' },
  }[size];
  return (
    <span className={cn('inline-flex items-center gap-2', className)} aria-label={brand.name} role="img">
      <LogoMark className={dims.mark} />
      <span aria-hidden className={cn('font-display font-bold italic leading-none tracking-tight', dims.text)}>
        <span className="text-fg">{brand.wordmark[0]}</span>
        <span className="text-accent-text">{brand.wordmark[1]}</span>
      </span>
    </span>
  );
}

/** Pantalla de carga con la identidad de la app. */
export function SplashScreen({ label = 'Cargando REFRUN…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-6">
        <LogoMark className="size-20 animate-stride motion-reduce:animate-none" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-1/3 animate-loading-bar rounded-full bg-accent" />
        </div>
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}
