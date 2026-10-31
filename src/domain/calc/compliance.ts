/**
 * Cálculo de objetivos, kilómetros y cumplimiento. ÚNICA fuente de estas
 * fórmulas: todas las pantallas y el envío de notificaciones usan estas funciones.
 *
 * METODOLOGÍA: compensación de deudas sin saldo a favor.
 *
 *   - SEMANA = periodo de competición: del sábado a las 09:00 al sábado siguiente
 *     a las 08:59 (zona horaria de la temporada; ver periodStartOf en lib/dates).
 *   - Cada partido genera una OBLIGACIÓN de target_km en el periodo de su fin de
 *     semana: un partido del sábado o del domingo empieza a contar el sábado a las
 *     09:00. Las obligaciones de un mismo periodo se suman.
 *   - Los km de los entrenamientos COMPUTABLES de una semana se asignan, en orden
 *     cronológico, a las obligaciones pendientes MÁS ANTIGUAS cuya semana ya ha
 *     empezado (semana ≤ semana del entrenamiento).
 *   - Lo que sobra cuando no queda ninguna obligación pendiente es EXCEDENTE: se
 *     pierde para la competición. Nunca se guarda como saldo para semanas futuras.
 *   - Las semanas futuras (aún no iniciadas) no reciben km ni cuentan como deuda.
 *
 * Para cada árbitro:
 *   km_deportivos    = Σ km computables (estadísticas: siempre la distancia real)
 *   km_validos       = parte de esos km asignada a obligaciones
 *   km_excedentes    = km_deportivos − km_validos
 *   km_pendientes    = Σ obligaciones iniciadas − km_validos
 *   %_cumplimiento   = km_validos / Σ obligaciones iniciadas × 100   (≤ 100 %)
 *
 * El resultado no depende del orden de los entrenamientos dentro de una semana,
 * así que la asignación por semanas es determinista y reproducible. Editar o
 * borrar cualquier partido o entrenamiento recalcula todo desde los datos brutos.
 */
import { compareIso, isWithin, matchPeriodOf, periodStartOf, type IsoDate } from '@/lib/dates';
import type { ActivityType, ValidationStatus } from '@/domain/types';

export interface MatchLike {
  referee_id: string;
  match_date: IsoDate;
  target_km: number;
}

export interface WorkoutLike {
  id?: string;
  user_id: string;
  activity_date: IsoDate;
  /** "HH:MM[:SS]" o null: decide el periodo de los entrenos del sábado. */
  activity_time?: string | null;
  week_start: IsoDate;
  distance_km: number;
  duration_s: number | null;
  activity_type: ActivityType;
  validation_status: ValidationStatus;
}

export interface SeasonRules {
  start_date: IsoDate;
  end_date: IsoDate;
  counted_activity_types: ActivityType[];
}

export type WeekPhase = 'past' | 'current' | 'upcoming';

export interface WeekLedger {
  /** Sábado en que empieza el periodo (a las 09:00). */
  weekStart: IsoDate;
  phase: WeekPhase;
  /** Objetivo nuevo de la semana (partidos asignados a ella). */
  targetKm: number;
  /** Km deportivos corridos esa semana. */
  completedKm: number;
  /** Deuda de semanas anteriores al empezar la semana. */
  carriedInKm: number;
  /** Km de esta semana que se han asignado a alguna obligación (deuda o propia). */
  validKm: number;
  /** Km de esta semana que no se han podido asignar (se pierden para la competición). */
  excessKm: number;
  /** Parte del objetivo de ESTA semana cubierta, con km de esta semana o posteriores. */
  coveredKm: number;
  /** Lo que queda hoy del objetivo de esta semana. */
  pendingKm: number;
  /** Deuda total pendiente al terminar la semana (incluye semanas anteriores). */
  outstandingKm: number;
  /** coveredKm / targetKm × 100 (≤ 100); null si la semana no tiene objetivo. */
  pct: number | null;
  met: boolean;
  workoutCount: number;
  matchCount: number;
}

export interface SeasonSummary {
  /** Σ obligaciones de semanas ya iniciadas. */
  targetKm: number;
  /** Km deportivos computables corridos en la temporada (todos). */
  completedKm: number;
  /** Km válidos para la competición (asignados a obligaciones). */
  attributableKm: number;
  pendingKm: number;
  /** Km excedentes: no cuentan para la competición ni generan crédito. */
  extraKm: number;
  /** Cumplimiento ≤ 100 %; null si aún no hay obligaciones. */
  pct: number | null;
  /** Objetivos ya asignados a semanas futuras (no cuentan todavía). */
  upcomingTargetKm: number;
  weeksWithTarget: number;
  weeksMet: number;
}

/** Vista de una semana como «objetivo efectivo» (deuda arrastrada + objetivo nuevo). */
export interface EffectiveWeek {
  carriedInKm: number;
  targetKm: number;
  effectiveTargetKm: number;
  completedKm: number;
  validKm: number;
  excessKm: number;
  pendingKm: number;
  pct: number | null;
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 1e-9;

/** ¿Cuenta este entrenamiento para la temporada? */
export function isCountable(w: WorkoutLike, season: SeasonRules): boolean {
  return (
    w.validation_status === 'confirmed' &&
    season.counted_activity_types.includes(w.activity_type) &&
    isWithin(w.activity_date, season.start_date, season.end_date)
  );
}

/** Porcentaje acotado a [0, 100]; null si no hay objetivo. */
export function cappedPct(valid: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.min(100, Math.max(0, (valid / target) * 100));
}

/** Periodo de competición al que pertenece un entrenamiento. */
export function workoutPeriod(w: Pick<WorkoutLike, 'activity_date' | 'activity_time'>): IsoDate {
  return periodStartOf(w.activity_date, w.activity_time);
}

function phaseOf(weekStart: IsoDate, currentWeek: IsoDate): WeekPhase {
  const c = compareIso(weekStart, currentWeek);
  return c < 0 ? 'past' : c === 0 ? 'current' : 'upcoming';
}

/**
 * Libro semanal de un usuario con la asignación de km a obligaciones.
 * Una fila por cada semana con objetivo o con entrenamientos computables.
 */
export function buildWeeklyLedger(
  userId: string,
  matches: readonly MatchLike[],
  workouts: readonly WorkoutLike[],
  season: SeasonRules,
  currentWeek: IsoDate,
): WeekLedger[] {
  const weeks = new Map<IsoDate, { target: number; km: number; workouts: number; matches: number }>();
  const slot = (week: IsoDate) => {
    let s = weeks.get(week);
    if (!s) {
      s = { target: 0, km: 0, workouts: 0, matches: 0 };
      weeks.set(week, s);
    }
    return s;
  };
  for (const m of matches) {
    if (m.referee_id !== userId) continue;
    const s = slot(matchPeriodOf(m.match_date));
    s.target += m.target_km;
    s.matches += 1;
  }
  for (const w of workouts) {
    if (w.user_id !== userId || !isCountable(w, season)) continue;
    const s = slot(workoutPeriod(w));
    s.km += Number(w.distance_km);
    s.workouts += 1;
  }

  const ordered = [...weeks.entries()].sort(([a], [b]) => compareIso(a, b));
  const rows = ordered.map(([weekStart, s]) => ({
    weekStart,
    phase: phaseOf(weekStart, currentWeek),
    target: s.target,
    km: s.km,
    workouts: s.workouts,
    matches: s.matches,
    carriedIn: 0,
    valid: 0,
    covered: 0,
    outstanding: 0,
  }));

  // Cola FIFO de obligaciones abiertas (índices de filas con objetivo sin cubrir).
  const open: number[] = [];
  let debt = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.phase === 'upcoming') continue; // aún no exigible y sin entrenamientos posibles
    row.carriedIn = debt;
    if (row.target > 0) {
      open.push(i);
      debt += row.target;
    }
    let km = row.km;
    while (km > EPS && open.length > 0) {
      const ob = rows[open[0]!]!;
      const take = Math.min(km, ob.target - ob.covered);
      ob.covered += take;
      row.valid += take;
      debt -= take;
      km -= take;
      if (ob.target - ob.covered <= EPS) open.shift();
    }
    row.outstanding = Math.max(0, debt);
  }

  return rows.map((r) => {
    const covered = round3(r.covered);
    const completedKm = round3(r.km);
    const validKm = round3(r.valid);
    return {
      weekStart: r.weekStart,
      phase: r.phase,
      targetKm: r.target,
      completedKm,
      carriedInKm: round3(r.carriedIn),
      validKm,
      excessKm: round3(Math.max(0, completedKm - validKm)),
      coveredKm: covered,
      pendingKm: round3(Math.max(0, r.target - covered)),
      outstandingKm: round3(r.outstanding),
      pct: cappedPct(covered, r.target),
      met: r.target > 0 && r.target - covered <= EPS,
      workoutCount: r.workouts,
      matchCount: r.matches,
    };
  });
}

export function summarizeSeason(weeks: readonly WeekLedger[]): SeasonSummary {
  const started = weeks.filter((w) => w.phase !== 'upcoming');
  const targetKm = started.reduce((acc, w) => acc + w.targetKm, 0);
  const completedKm = round3(started.reduce((acc, w) => acc + w.completedKm, 0));
  const valid = round3(started.reduce((acc, w) => acc + w.validKm, 0));
  const withTarget = started.filter((w) => w.targetKm > 0);
  return {
    targetKm,
    completedKm,
    attributableKm: valid,
    pendingKm: round3(Math.max(0, targetKm - valid)),
    extraKm: round3(Math.max(0, completedKm - valid)),
    pct: cappedPct(valid, targetKm),
    upcomingTargetKm: weeks.filter((w) => w.phase === 'upcoming').reduce((acc, w) => acc + w.targetKm, 0),
    weeksWithTarget: withTarget.length,
    weeksMet: withTarget.filter((w) => w.met).length,
  };
}

/** Semana concreta del libro; si no hay registros, una semana vacía que arrastra la deuda viva. */
export function weekOf(weeks: readonly WeekLedger[], weekStart: IsoDate, currentWeek: IsoDate): WeekLedger {
  const found = weeks.find((w) => w.weekStart === weekStart);
  if (found) return found;
  const phase = phaseOf(weekStart, currentWeek);
  const prev = phase === 'upcoming' ? undefined : [...weeks].reverse().find((w) => w.phase !== 'upcoming' && compareIso(w.weekStart, weekStart) < 0);
  const debt = prev?.outstandingKm ?? 0;
  return {
    weekStart,
    phase,
    targetKm: 0,
    completedKm: 0,
    carriedInKm: debt,
    validKm: 0,
    excessKm: 0,
    coveredKm: 0,
    pendingKm: 0,
    outstandingKm: debt,
    pct: null,
    met: false,
    workoutCount: 0,
    matchCount: 0,
  };
}

/** La semana vista como deuda arrastrada + objetivo nuevo frente a lo corrido en ella. */
export function effectiveWeek(w: WeekLedger): EffectiveWeek {
  const effective = round3(w.carriedInKm + w.targetKm);
  return {
    carriedInKm: w.carriedInKm,
    targetKm: w.targetKm,
    effectiveTargetKm: effective,
    completedKm: w.completedKm,
    validKm: w.validKm,
    excessKm: w.excessKm,
    pendingKm: w.outstandingKm,
    pct: cappedPct(w.validKm, effective),
  };
}

/** Suma los libros semanales de varios árbitros (vista de todo el grupo). */
export function mergeLedgers(ledgers: ReadonlyArray<readonly WeekLedger[]>): WeekLedger[] {
  const map = new Map<IsoDate, WeekLedger>();
  const sumKeys = ['targetKm', 'completedKm', 'carriedInKm', 'validKm', 'excessKm', 'coveredKm', 'pendingKm', 'outstandingKm', 'workoutCount', 'matchCount'] as const;
  for (const ledger of ledgers) {
    for (const w of ledger) {
      const acc = map.get(w.weekStart);
      if (!acc) {
        map.set(w.weekStart, { ...w });
        continue;
      }
      for (const k of sumKeys) acc[k] = round3(acc[k] + w[k]);
    }
  }
  return [...map.values()]
    .sort((a, b) => compareIso(a.weekStart, b.weekStart))
    .map((w) => ({ ...w, pct: cappedPct(w.coveredKm, w.targetKm), met: w.targetKm > 0 && w.pendingKm === 0 }));
}

/** Totales del grupo: suma de los resúmenes individuales. */
export function combineSummaries(summaries: readonly SeasonSummary[]): SeasonSummary {
  const sum = (k: keyof SeasonSummary) => summaries.reduce((acc, s) => acc + (s[k] as number), 0);
  const targetKm = sum('targetKm');
  const attributable = round3(sum('attributableKm'));
  return {
    targetKm,
    completedKm: round3(sum('completedKm')),
    attributableKm: attributable,
    pendingKm: round3(sum('pendingKm')),
    extraKm: round3(sum('extraKm')),
    pct: cappedPct(attributable, targetKm),
    upcomingTargetKm: sum('upcomingTargetKm'),
    weeksWithTarget: sum('weeksWithTarget'),
    weeksMet: sum('weeksMet'),
  };
}
