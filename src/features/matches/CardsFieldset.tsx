import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { CARD_KM, CARD_LABELS, MAX_CARDS, parseCards, type CardColor, type TargetBreakdown } from '@/domain/calc/goals';
import { formatKm } from '@/lib/format';
import { cn } from '@/lib/utils';

export type CardValues = Record<CardColor, string>;

const COLORS: CardColor[] = ['yellow', 'blue', 'red'];

/** Singular para las etiquetas de los botones (+/−). */
const SINGULAR: Record<CardColor, string> = { yellow: 'amarilla', blue: 'azul', red: 'roja' };

/** Color de la propia tarjeta (no de la marca): amarilla, azul y roja reglamentarias. */
const CARD_SWATCH: Record<CardColor, string> = {
  yellow: 'bg-[#facc15]',
  blue: 'bg-[#2563eb]',
  red: 'bg-[#dc2626]',
};

export function CardSwatch({ color, className }: { color: CardColor; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-4 w-3 shrink-0 rounded-[3px] shadow-sm ring-1 ring-black/20', CARD_SWATCH[color], className)} />;
}

/**
 * Tres contadores (amarillas, azules, rojas) con botones grandes para el móvil.
 * Los valores son texto para poder mostrar errores de lo que escribe el usuario.
 */
export function CardsFieldset({
  values,
  onChange,
  errors,
  compact,
}: {
  values: CardValues;
  onChange(color: CardColor, value: string): void;
  errors?: Partial<Record<CardColor, string>>;
  compact?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Tarjetas</legend>
      <div className={cn('grid', compact ? 'grid-cols-3 gap-3' : 'grid-cols-1 gap-2')}>
        {COLORS.map((c) => (
          <CardCounter key={c} color={c} value={values[c]} onChange={(v) => onChange(c, v)} error={errors?.[c]} compact={compact} />
        ))}
      </div>
    </fieldset>
  );
}

function CardCounter({
  color,
  value,
  onChange,
  error,
  compact,
}: {
  color: CardColor;
  value: string;
  onChange(v: string): void;
  error?: string;
  compact?: boolean;
}) {
  const id = useId();
  const parsed = parseCards(value);
  const n = parsed.ok ? parsed.value : null;
  const label = CARD_LABELS[color];
  const kmEach = CARD_KM[color];
  const input = (
    <input
      id={id}
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-km ${id}-error` : `${id}-km`}
      className={cn(
        'num h-11 min-w-0 rounded-xl border border-border bg-surface-2/60 text-center text-2xl font-bold text-fg focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-danger/70',
        compact ? 'mt-2 w-full' : 'w-16',
      )}
    />
  );
  const stepClass =
    'grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-fg transition active:scale-95 disabled:opacity-40';
  return (
    <div className={cn('rounded-xl border border-border/70 bg-surface-2/40', compact ? 'p-3' : 'px-3 py-2.5', error && 'border-danger/60')}>
      <div className="flex items-center gap-2">
        <CardSwatch color={color} />
        <div className="min-w-0">
          <label htmlFor={id} className="block text-sm font-medium">
            {label}
          </label>
          <span id={`${id}-km`} className="block text-xs text-muted">
            {kmEach} km c/u
          </span>
        </div>
        {!compact && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label={`Una tarjeta ${SINGULAR[color]} menos`}
              disabled={n === null || n <= 0}
              onClick={() => onChange(String((n ?? 1) - 1))}
              className={stepClass}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            {input}
            <button
              type="button"
              aria-label={`Una tarjeta ${SINGULAR[color]} más`}
              disabled={n !== null && n >= MAX_CARDS}
              onClick={() => onChange(String(n === null ? 1 : n + 1))}
              className={stepClass}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
      {compact && input}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Desglose del objetivo: goles + cada tipo de tarjeta = total. */
export function TargetBreakdownList({ b, className }: { b: TargetBreakdown; className?: string }) {
  const rows: Array<{ label: string; km: number; color?: CardColor }> = [
    { label: `Goles (${b.score})`, km: b.goalsKm },
    { label: 'Tarjetas amarillas', km: b.yellowKm, color: 'yellow' },
    { label: 'Tarjetas azules', km: b.blueKm, color: 'blue' },
    { label: 'Tarjetas rojas', km: b.redKm, color: 'red' },
  ];
  return (
    <dl className={cn('space-y-1 text-sm', className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-muted">
            {r.color && <CardSwatch color={r.color} className="h-3.5 w-2.5" />}
            {r.label}
          </dt>
          <dd className="num font-semibold">{formatKm(r.km)} km</dd>
        </div>
      ))}
    </dl>
  );
}
