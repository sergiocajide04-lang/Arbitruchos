/** Formateadores de cifras deportivas en español. */

const km1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const km2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/** 14 → "14", 8.42 → "8,4" */
export function formatKm(value: number, precise = false): string {
  return precise ? km2.format(value) : km1.format(value);
}

export function formatInt(value: number): string {
  return int.format(value);
}

/** Porcentaje sin decimales; null → "Sin objetivo". */
export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Sin objetivo';
  return `${int.format(Math.floor(value))} %`;
}

/** Segundos por km → "5:46". */
export function formatPace(secondsPerKm: number | null | undefined): string {
  if (secondsPerKm === null || secondsPerKm === undefined || !Number.isFinite(secondsPerKm)) return '—';
  const total = Math.round(secondsPerKm);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/** Segundos → "48:35" o "1:02:10". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Segundos → "3 h 12 min" (para totales). */
export function formatDurationLong(seconds: number): string {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatSpeed(kmh: number | null | undefined): string {
  if (kmh === null || kmh === undefined || !Number.isFinite(kmh)) return '—';
  return km1.format(kmh);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const relative = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });

export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffSec = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 60) return 'ahora mismo';
  if (abs < 3600) return relative.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return relative.format(Math.round(diffSec / 86400), 'day');
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}
