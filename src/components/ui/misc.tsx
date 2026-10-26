import { CheckCircle2, Clock3, XCircle, type LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { AvatarColor, ValidationStatus } from '@/domain/types';
import { VALIDATION_LABELS } from '@/domain/types';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  accent: 'bg-accent/15 text-accent-text border-accent/30',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  info: 'bg-info/10 text-info border-info/30',
};

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}

const statusMeta: Record<ValidationStatus, { tone: Tone; icon: LucideIcon }> = {
  confirmed: { tone: 'success', icon: CheckCircle2 },
  pending: { tone: 'warning', icon: Clock3 },
  rejected: { tone: 'danger', icon: XCircle },
};

export function StatusBadge({ status }: { status: ValidationStatus }) {
  const { tone, icon: Icon } = statusMeta[status];
  return (
    <Badge tone={tone}>
      <Icon className="size-3" aria-hidden />
      {VALIDATION_LABELS[status]}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Progreso
// ---------------------------------------------------------------------------
export function ProgressBar({
  value,
  label,
  className,
  size = 'md',
}: {
  /** Porcentaje (puede superar 100; la barra se llena al 100 %). */
  value: number | null;
  label: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const met = value !== null && value >= 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={value === null ? 'Sin objetivo' : `${Math.floor(value)} %`}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-surface-2',
        size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3.5' : 'h-2.5',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-out',
          met ? 'bg-accent' : 'bg-gradient-to-r from-accent/70 to-accent',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
const avatarColors: Record<AvatarColor, string> = {
  lime: 'bg-[#C6F432] text-[#0E0F11]',
  cyan: 'bg-[#5EE6EB] text-[#0E0F11]',
  amber: 'bg-[#FFC14D] text-[#0E0F11]',
  violet: 'bg-[#B79CFF] text-[#0E0F11]',
  rose: 'bg-[#FF8FAB] text-[#0E0F11]',
  sky: 'bg-[#7CC4FF] text-[#0E0F11]',
  orange: 'bg-[#FF9F5A] text-[#0E0F11]',
  teal: 'bg-[#4FD1A5] text-[#0E0F11]',
};
export const AVATAR_COLORS = Object.keys(avatarColors) as AvatarColor[];

export function Avatar({
  name,
  color = 'lime',
  size = 'md',
  className,
}: {
  name: string;
  color?: AvatarColor;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = { xs: 'size-6 text-[10px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg', xl: 'size-20 text-2xl' };
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-bold tracking-wide',
        avatarColors[color] ?? avatarColors.lime,
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Estados vacíos, carga y error
// ---------------------------------------------------------------------------
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-border bg-surface-2 text-accent-text">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-xl bg-surface-2', className)} />;
}

export function LoadingBlock({ label = 'Cargando…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('space-y-3', className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-36" />
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 p-6 text-center">
      <XCircle className="size-8 text-danger" aria-hidden />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-sm font-semibold text-accent-text underline-offset-4 hover:underline">
          Reintentar
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cifra destacada
// ---------------------------------------------------------------------------
export function Stat({
  label,
  value,
  unit,
  hint,
  className,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="eyebrow leading-snug">{label}</p>
      <p className={cn('num mt-1 truncate font-bold leading-none', emphasis ? 'text-3xl text-accent-text' : 'text-2xl')}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-muted">{unit}</span>}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control segmentado (radiogroup accesible)
// ---------------------------------------------------------------------------
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl border border-border bg-surface-2/60 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-surface text-fg shadow-sm ring-1 ring-border' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
