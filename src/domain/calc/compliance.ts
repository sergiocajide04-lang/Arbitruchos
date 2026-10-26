/**
 * Cálculo de objetivos, kilómetros y cumplimiento. ÚNICA fuente de estas
 * fórmulas en la aplicación: todas las pantallas usan estas funciones.
 *
 * Definiciones (por árbitro y semana ISO lunes-domingo):
 *   objetivo_semana    = Σ target_km de sus partidos asignados a esa semana
 *   completados_semana = Σ distance_km de sus entrenamientos COMPUTABLES de esa semana
 *   pendientes_semana  = max(0, objetivo − completados)
 *   %_semana           = completados / objetivo × 100   (sin tope; null si objetivo = 0)
 *
 * Temporada:
 *   - season_total (POR DEFECTO, "acumulado"): todos los objetivos y todos los km
 *     se suman a lo largo de la temporada, semana tras semana.
 *       objetivo_acumulado = Σ objetivos de TODOS los partidos registrados
 *       pendientes         = max(0, objetivo_acumulado − km_corridos)
 *       %_temporada        = km_corridos / objetivo_acumulado × 100 (sin tope)
 *   Políticas alternativas (solo semanas cuyo lunes es ≤ la semana actual):
 *   %_temporada = 100 × km_atribuibles / Σ objetivos
 *   - weekly_independent: km_atribuibles = Σ min(completados, objetivo) por semana.
 *     El exceso de una semana NO compensa otras, pero los km se conservan y se muestran.
 *   - carry_forward: además, el exceso de una semana compensa el déficit acumulado
 *     de semanas ANTERIORES de la misma temporada (nunca de semanas futuras).
 */
import { compareIso, isWithin, type IsoDate } from '@/lib/dates';
import type { ActivityType, CompliancePolicy, ValidationStatus } from '@/domain/types';

export interface MatchLike {
  referee_id: string;
  week_start: IsoDate;
  target_km: number;
}

export interface WorkoutLike {
  id?: string;
  user_id: string;
  activity_date: IsoDate;
  week_start: IsoDate;
  distance_km: number;
  duration_s: number | null;
  activity_type: ActivityType;
  validation_status: ValidationStatus;
}

export interface SeasonRules {
  start_date: IsoDate;
  end_date: IsoDate;
  compliance_policy: CompliancePolicy;
  counted_activity_types: ActivityType[];
}

export type WeekPhase = 'past' | 'current' | 'upcoming';

export interface WeekLedger {
  weekStart: IsoDate;
  phase: WeekPhase;
  targetKm: number;
  completedKm: number;
  pendingKm: number;
  /** completados/objetivo×100 sin tope; null si no hay objetivo. */
  pct: number | null;
  met: boolean;
  workoutCount: number;
  matchCount: number;
}

export interface SeasonSummary {
  /** Σ objetivos de semanas ya iniciadas. */
  targetKm: number;
  /** Km computables realmente corridos en la temporada (incluye excesos). */
  completedKm: number;
  /** Km que cuentan para el porcentaje según la política. */
  attributableKm: number;
  pendingKm: number;
  /** Km por encima de lo atribuible (excesos que no compensan). */
  extraKm: number;
  pct: number | null;
  /** Objetivos ya asignados a semanas futuras (no cuentan todavía). */
  upcomingTargetKm: number;
  weeksWithTarget: number;
  weeksMet: number;
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** ¿Cuenta este entrenamiento para el objetivo de la temporada? */
export function isCountable(w: WorkoutLike, season: SeasonRules): boolean {
  return (
    w.validation_status === 'confirmed' &&
    season.counted_activity_types.includes(w.activity_type) &&
    isWithin(w.activity_date, season.start_date, season.end_date)
  );
}

export function weekPct(completedKm: number, targetKm: number): number | null {
  if (targetKm <= 0) return null;
  return (completedKm / targetKm) * 100;
}

export function pendingKm(completedKm: number, targetKm: number): number {
  return round3(Math.max(0, targetKm - completedKm));
}

function phaseOf(weekStart: IsoDate, currentWeek: IsoDate): WeekPhase {
  const c = compareIso(weekStart, currentWeek);
  return c < 0 ? 'past' : c === 0 ? 'current' : 'upcoming';
}

/**
 * Libro semanal de un usuario: una fila por cada semana con objetivo o con
 * entrenamientos computables, ordenadas cronológicamente.
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
    const s = slot(m.week_start);
    s.target += m.target_km;
    s.matches += 1;
  }
  for (const w of workouts) {
    if (w.user_id !== userId || !isCountable(w, season)) continue;
    const s = slot(w.week_start);
    s.km += Number(w.distance_km);
    s.workouts += 1;
  }

  return [...weeks.entries()]
    .sort(([a], [b]) => compareIso(a, b))
    .map(([weekStart, s]) => {
      const completedKm = round3(s.km);
      return {
        weekStart,
        phase: phaseOf(weekStart, currentWeek),
        targetKm: s.target,
        completedKm,
        pendingKm: pendingKm(completedKm, s.target),
        pct: weekPct(completedKm, s.target),
        met: s.target > 0 && completedKm >= s.target,
        workoutCount: s.workouts,
        matchCount: s.matches,
      };
    });
}

/** Km atribuibles a objetivos según la política de compensación. */
export function attributableKm(
  weeks: ReadonlyArray<Pick<WeekLedger, 'targetKm' | 'completedKm'>>,
  policy: CompliancePolicy,
): number {
  let attributable = 0;
  let deficit = 0;
  for (const w of weeks) {
    const base = Math.min(w.completedKm, w.targetKm);
    attributable += base;
    if (policy === 'carry_forward') {
      deficit += w.targetKm - base;
      const excess = w.completedKm - base;
      const recovered = Math.min(excess, deficit);
      attributable += recovered;
      deficit -= recovered;
    }
  }
  return round3(attributable);
}

export function summarizeSeason(weeks: readonly WeekLedger[], policy: CompliancePolicy): SeasonSummary {
  if (policy === 'season_total') {
    // Acumulado: cuentan todos los partidos registrados y todos los km corridos.
    const targetKm = weeks.reduce((acc, w) => acc + w.targetKm, 0);
    const completedKm = round3(weeks.reduce((acc, w) => acc + w.completedKm, 0));
    const withTarget = weeks.filter((w) => w.targetKm > 0 && w.phase !== 'upcoming');
    return {
      targetKm,
      completedKm,
      attributableKm: completedKm,
      pendingKm: round3(Math.max(0, targetKm - completedKm)),
      extraKm: round3(Math.max(0, completedKm - targetKm)),
      pct: targetKm > 0 ? (completedKm / targetKm) * 100 : null,
      upcomingTargetKm: weeks.filter((w) => w.phase === 'upcoming').reduce((acc, w) => acc + w.targetKm, 0),
      weeksWithTarget: withTarget.length,
      weeksMet: withTarget.filter((w) => w.met).length,
    };
  }
  const started = weeks.filter((w) => w.phase !== 'upcoming');
  const targetKm = started.reduce((acc, w) => acc + w.targetKm, 0);
  const completedKm = round3(started.reduce((acc, w) => acc + w.completedKm, 0));
  const attributable = attributableKm(started, policy);
  const withTarget = started.filter((w) => w.targetKm > 0);
  return {
    targetKm,
    completedKm,
    attributableKm: attributable,
    pendingKm: round3(Math.max(0, targetKm - attributable)),
    extraKm: round3(Math.max(0, completedKm - attributable)),
    pct: targetKm > 0 ? (attributable / targetKm) * 100 : null,
    upcomingTargetKm: weeks.filter((w) => w.phase === 'upcoming').reduce((acc, w) => acc + w.targetKm, 0),
    weeksWithTarget: withTarget.length,
    weeksMet: withTarget.filter((w) => w.met).length,
  };
}

/** Semana concreta del libro (o una semana vacía si no hay registros). */
export function weekOf(weeks: readonly WeekLedger[], weekStart: IsoDate, currentWeek: IsoDate): WeekLedger {
  return (
    weeks.find((w) => w.weekStart === weekStart) ?? {
      weekStart,
      phase: phaseOf(weekStart, currentWeek),
      targetKm: 0,
      completedKm: 0,
      pendingKm: 0,
      pct: null,
      met: false,
      workoutCount: 0,
      matchCount: 0,
    }
  );
}

/** Suma los libros semanales de varios árbitros (vista de todo el grupo). */
export function mergeLedgers(ledgers: ReadonlyArray<readonly WeekLedger[]>): WeekLedger[] {
  const map = new Map<IsoDate, WeekLedger>();
  for (const ledger of ledgers) {
    for (const w of ledger) {
      const acc = map.get(w.weekStart);
      if (!acc) {
        map.set(w.weekStart, { ...w });
        continue;
      }
      acc.targetKm += w.targetKm;
      acc.completedKm = round3(acc.completedKm + w.completedKm);
      acc.workoutCount += w.workoutCount;
      acc.matchCount += w.matchCount;
    }
  }
  return [...map.values()]
    .sort((a, b) => compareIso(a.weekStart, b.weekStart))
    .map((w) => ({
      ...w,
      pendingKm: pendingKm(w.completedKm, w.targetKm),
      pct: weekPct(w.completedKm, w.targetKm),
      met: w.targetKm > 0 && w.completedKm >= w.targetKm,
    }));
}

/** Totales del grupo: suma de los resúmenes individuales (respeta la política de cada árbitro). */
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
    pct: targetKm > 0 ? (attributable / targetKm) * 100 : null,
    upcomingTargetKm: sum('upcomingTargetKm'),
    weeksWithTarget: sum('weeksWithTarget'),
    weeksMet: sum('weeksMet'),
  };
}
