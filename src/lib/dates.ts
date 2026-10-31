/**
 * Utilidades de fechas basadas en cadenas ISO "YYYY-MM-DD" (fechas de calendario
 * sin hora). Las operaciones se hacen en UTC para que no influya la zona horaria
 * del dispositivo; la zona horaria del grupo solo se usa para saber qué día es "hoy".
 *
 * Convención semanal: semanas ISO de lunes a domingo.
 */

export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): value is IsoDate {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function toUtc(date: IsoDate): Date {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Fecha no válida: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

/** Fecha de calendario actual en una zona horaria IANA (p. ej. Europe/Madrid). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hora local "HH:MM" en una zona horaria. */
export function timeInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** 1 = lunes … 7 = domingo (ISO). */
export function isoWeekday(date: IsoDate): number {
  const day = toUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Lunes de la semana ISO que contiene la fecha. */
export function weekStartOf(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekEndOf(date: IsoDate): IsoDate {
  return addDays(weekStartOf(date), 6);
}

/**
 * Semana de cumplimiento por defecto para un partido: la semana que empieza el
 * lunes siguiente a la fecha del partido. Un partido del sábado 24 genera el
 * objetivo para la semana del lunes 26 al domingo 1.
 */
export function defaultComplianceWeek(matchDate: IsoDate): IsoDate {
  return addDays(weekStartOf(matchDate), 7);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isWithin(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return date >= start && date <= end;
}

/** Número de semana ISO 8601. */
export function isoWeekNumber(date: IsoDate): number {
  const d = toUtc(date);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Lista de lunes desde la semana de `start` hasta la de `end`, ambas incluidas. */
export function weeksInRange(start: IsoDate, end: IsoDate): IsoDate[] {
  const weeks: IsoDate[] = [];
  let cursor = weekStartOf(start);
  const last = weekStartOf(end);
  while (cursor <= last) {
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** Número de semana dentro de la temporada (1 = la semana que contiene start_date). */
export function seasonWeekIndex(seasonStart: IsoDate, weekStart: IsoDate): number {
  return Math.floor(daysBetween(weekStartOf(seasonStart), weekStart) / 7) + 1;
}

const dayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function formatDayMonth(date: IsoDate): string {
  return dayMonth.format(toUtc(date)).replace('.', '');
}

export function formatLongDate(date: IsoDate): string {
  return fullDate.format(toUtc(date));
}

export function formatShortDate(date: IsoDate): string {
  return shortDate.format(toUtc(date)).replace(/\./g, '');
}

export function formatMonthYear(date: IsoDate): string {
  return monthYear.format(toUtc(date));
}

/** "26 oct – 1 nov" */
export function formatWeekRange(weekStart: IsoDate): string {
  return `${formatDayMonth(weekStart)} – ${formatDayMonth(addDays(weekStart, 6))}`;
}

export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

// ---------------------------------------------------------------------------
// Periodo de competición: del SÁBADO a las 09:00 al sábado siguiente a las 08:59
// (zona horaria de la temporada). Un periodo se identifica por la fecha de su
// sábado de inicio. Es la «semana» de todos los cálculos de cumplimiento.
// ---------------------------------------------------------------------------
export const PERIOD_START_HOUR = 9;

/**
 * Periodo al que pertenece un momento. Un sábado antes de las 09:00 pertenece al
 * periodo anterior. Si no se conoce la hora (entrenos sin hora), un sábado cuenta
 * para el periodo que empieza ese día.
 */
export function periodStartOf(date: IsoDate, time?: string | null): IsoDate {
  const sinceSaturday = (isoWeekday(date) + 1) % 7; // sábado → 0, domingo → 1, … viernes → 6
  if (sinceSaturday === 0 && time && Number(time.slice(0, 2)) < PERIOD_START_HOUR) return addDays(date, -7);
  return addDays(date, -sinceSaturday);
}

/**
 * Periodo en el que empieza a contar el objetivo de un partido: el del fin de
 * semana en que se juega (sábado o domingo → ese sábado; viernes → el sábado
 * siguiente). Entre semana, el periodo en curso.
 */
export function matchPeriodOf(matchDate: IsoDate): IsoDate {
  return isoWeekday(matchDate) === 5 ? addDays(matchDate, 1) : periodStartOf(matchDate);
}

/** Periodo en curso en una zona horaria. */
export function currentPeriodIn(timeZone: string, now: Date = new Date()): IsoDate {
  return periodStartOf(todayInTimeZone(timeZone, now), timeInTimeZone(timeZone, now));
}

/** Sábados de inicio de periodo desde el de `start` hasta el de `end`, ambos incluidos. */
export function periodsInRange(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let p = periodStartOf(start); p <= periodStartOf(end); p = addDays(p, 7)) out.push(p);
  return out;
}

/** Número de periodo dentro de la temporada (1 = el que contiene start_date). */
export function seasonPeriodIndex(seasonStart: IsoDate, period: IsoDate): number {
  return Math.floor(daysBetween(periodStartOf(seasonStart), period) / 7) + 1;
}

const weekdayDayMonth = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "sáb 31 oct – sáb 7 nov" (de sábado 9:00 a sábado 8:59). */
export function formatPeriodRange(period: IsoDate): string {
  const f = (d: IsoDate) => weekdayDayMonth.format(toUtc(d)).replace(/[.,]/g, '');
  return `${f(period)} – ${f(addDays(period, 7))}`;
}
