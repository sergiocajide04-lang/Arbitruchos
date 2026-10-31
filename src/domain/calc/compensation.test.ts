import { describe, expect, it } from 'vitest';
import { weekStartOf } from '@/lib/dates';
import { monthlySeries } from '@/features/stats/series';
import {
  buildWeeklyLedger,
  combineSummaries,
  effectiveWeek,
  mergeLedgers,
  summarizeSeason,
  weekOf,
  type MatchLike,
  type SeasonRules,
  type WorkoutLike,
} from './compliance';

/**
 * Regla definitiva: los km de más compensan deudas anteriores, pero nunca
 * generan crédito para el futuro. Casos A–H del documento de requisitos.
 */
const season: SeasonRules = { start_date: '2026-09-01', end_date: '2027-06-30', counted_activity_types: ['run', 'treadmill'] };

const W1 = '2026-10-05';
const W2 = '2026-10-12';
const W3 = '2026-10-19';

const run = (date: string, km: number, user = 'u1', durationS: number | null = null): WorkoutLike => ({
  user_id: user,
  activity_date: date,
  week_start: weekStartOf(date),
  distance_km: km,
  duration_s: durationS,
  activity_type: 'run',
  validation_status: 'confirmed',
});
const goal = (week: string, km: number, user = 'u1'): MatchLike => ({ referee_id: user, week_start: week, target_km: km });

const summary = (matches: MatchLike[], workouts: WorkoutLike[], current: string) =>
  summarizeSeason(buildWeeklyLedger('u1', matches, workouts, season, current));

describe('compensación de deudas sin saldo a favor', () => {
  it('Caso A: objetivo 10, carrera de 29 → 10 válidos, 19 excedentes, 100 %', () => {
    const s = summary([goal(W1, 10)], [run('2026-10-06', 29)], W1);
    expect(s).toMatchObject({ targetKm: 10, completedKm: 29, attributableKm: 10, extraKm: 19, pendingKm: 0, pct: 100 });
  });

  it('Caso B: una segunda carrera de 3 km no vuelve a contar (32 deportivos, 10 válidos, 22 excedentes)', () => {
    const misma = summary([goal(W1, 10)], [run('2026-10-06', 29), run('2026-10-08', 3)], W1);
    expect(misma).toMatchObject({ completedKm: 32, attributableKm: 10, extraKm: 22, pendingKm: 0, pct: 100 });
    // Igual si los 3 km se corren la semana siguiente sin objetivo nuevo.
    const siguiente = summary([goal(W1, 10)], [run('2026-10-06', 29), run('2026-10-13', 3)], W2);
    expect(siguiente).toMatchObject({ completedKm: 32, attributableKm: 10, extraKm: 22, pendingKm: 0, pct: 100 });
  });

  it('Caso C: la deuda se arrastra (12 válidos sobre 14 de obligación efectiva, 2 pendientes)', () => {
    const matches = [goal(W1, 10), goal(W2, 10)];
    const workouts = [run('2026-10-06', 6), run('2026-10-13', 12)];
    const ledger = buildWeeklyLedger('u1', matches, workouts, season, W2);
    const week2 = effectiveWeek(weekOf(ledger, W2, W2));
    expect(week2).toMatchObject({ carriedInKm: 4, targetKm: 10, effectiveTargetKm: 14, validKm: 12, pendingKm: 2, excessKm: 0 });
    expect(week2.pct).toBeCloseTo((12 / 14) * 100, 6); // 85,71 %
    // Los 4 km de deuda se pagan primero: la semana 1 queda cubierta.
    expect(ledger[0]).toMatchObject({ weekStart: W1, coveredKm: 10, pendingKm: 0, met: true });
    expect(ledger[1]).toMatchObject({ weekStart: W2, coveredKm: 8, pendingKm: 2, met: false });
    expect(summarizeSeason(ledger)).toMatchObject({ targetKm: 20, attributableKm: 18, pendingKm: 2, pct: 90 });
  });

  it('Caso D: deuda de 2 km y carrera de 5 → 2 cubren la deuda y 3 se descartan; no reducen un objetivo futuro', () => {
    const matches = [goal(W1, 10), goal(W2, 10)];
    const workouts = [run('2026-10-06', 6), run('2026-10-13', 12), run('2026-10-15', 5)];
    const s2 = summary(matches, workouts, W2);
    expect(s2).toMatchObject({ attributableKm: 20, pendingKm: 0, extraKm: 3, pct: 100 });
    // Llega un objetivo nuevo de 8 km: los 3 km sobrantes NO lo reducen.
    const s3 = summary([...matches, goal(W3, 8)], workouts, W3);
    expect(s3).toMatchObject({ targetKm: 28, attributableKm: 20, pendingKm: 8, extraKm: 3 });
  });

  it('Caso D (variante): con objetivo vigente, 2 km pagan la deuda y 3 el objetivo actual', () => {
    const matches = [goal(W1, 2), goal(W2, 10)];
    const ledger = buildWeeklyLedger('u1', matches, [run('2026-10-13', 5)], season, W2);
    expect(ledger[0]).toMatchObject({ coveredKm: 2, pendingKm: 0 });
    expect(ledger[1]).toMatchObject({ coveredKm: 3, pendingKm: 7, validKm: 5, excessKm: 0 });
  });

  it('Caso E: con todo cubierto, 5 km más suman 5 deportivos y 0 competitivos', () => {
    const matches = [goal(W1, 10)];
    const before = summary(matches, [run('2026-10-06', 10)], W1);
    const after = summary(matches, [run('2026-10-06', 10), run('2026-10-07', 5)], W1);
    expect(after.completedKm - before.completedKm).toBe(5);
    expect(after.attributableKm).toBe(before.attributableKm);
    expect(after.pct).toBe(100);
  });

  it('Caso F: un objetivo nuevo de una semana futura no se cubre con excedentes anteriores', () => {
    const workouts = [run('2026-10-06', 29)];
    const matches = [goal(W1, 10), goal(W3, 8)];
    // Antes de que empiece la semana 3: aún no es exigible.
    expect(summary(matches, workouts, W2)).toMatchObject({ pendingKm: 0, upcomingTargetKm: 8, pct: 100 });
    // Cuando empieza: 8 km pendientes, el excedente de 19 no cuenta.
    expect(summary(matches, workouts, W3)).toMatchObject({ targetKm: 18, attributableKm: 10, pendingKm: 8, extraKm: 19 });
    // Un entreno anterior a la semana del objetivo tampoco lo cubre.
    expect(summary([goal(W2, 10)], [run('2026-10-06', 15)], W2)).toMatchObject({ pendingKm: 10, attributableKm: 0, extraKm: 15 });
  });

  it('Caso G: editar un entrenamiento histórico recalcula sin duplicar kilómetros', () => {
    const matches = [goal(W1, 10), goal(W2, 10)];
    const original = [run('2026-10-06', 6), run('2026-10-13', 12)];
    const edited = [run('2026-10-06', 9), run('2026-10-13', 12)];
    const a = summary(matches, original, W2);
    const b = summary(matches, edited, W2);
    expect(a).toMatchObject({ completedKm: 18, attributableKm: 18, pendingKm: 2, extraKm: 0 });
    expect(b).toMatchObject({ completedKm: 21, attributableKm: 20, pendingKm: 0, extraKm: 1 });
    expect(b.attributableKm + b.extraKm).toBe(b.completedKm);
  });

  it('Caso H: eliminar un entrenamiento actualiza la deuda y conserva el resto', () => {
    const matches = [goal(W1, 10), goal(W2, 10)];
    const all = [run('2026-10-06', 6), run('2026-10-13', 12)];
    const without = all.slice(1);
    const s = summary(matches, without, W2);
    expect(s).toMatchObject({ completedKm: 12, attributableKm: 12, pendingKm: 8 });
    const ledger = buildWeeklyLedger('u1', matches, without, season, W2);
    expect(ledger[0]).toMatchObject({ coveredKm: 10, completedKm: 0 }); // la deuda antigua se paga primero
    expect(ledger[1]).toMatchObject({ coveredKm: 2, pendingKm: 8, workoutCount: 1 });
  });

  it('es determinista: el orden de los datos no cambia el resultado', () => {
    const matches = [goal(W2, 10), goal(W1, 10), goal(W3, 7)];
    const workouts = [run('2026-10-13', 12), run('2026-10-20', 4), run('2026-10-06', 6), run('2026-10-21', 9)];
    const a = buildWeeklyLedger('u1', matches, workouts, season, W3);
    const b = buildWeeklyLedger('u1', [...matches].reverse(), [...workouts].reverse(), season, W3);
    expect(b).toEqual(a);
    const s = summarizeSeason(a);
    expect(s.attributableKm + s.extraKm).toBe(s.completedKm);
    expect(s.attributableKm + s.pendingKm).toBe(s.targetKm);
  });

  it('una semana sin registros arrastra la deuda viva', () => {
    const ledger = buildWeeklyLedger('u1', [goal(W1, 10)], [run('2026-10-06', 6)], season, W2);
    expect(weekOf(ledger, W2, W2)).toMatchObject({ carriedInKm: 4, outstandingKm: 4, targetKm: 0 });
  });
});

describe('totales del grupo y series', () => {
  it('suma válidos, excedentes y pendientes de todos', () => {
    const matches = [goal(W1, 10, 'u1'), goal(W1, 10, 'u2')];
    const workouts = [run('2026-10-06', 25, 'u1'), run('2026-10-06', 4, 'u2')];
    const ledgers = ['u1', 'u2'].map((u) => buildWeeklyLedger(u, matches, workouts, season, W1));
    const total = combineSummaries(ledgers.map((l) => summarizeSeason(l)));
    expect(total).toMatchObject({ targetKm: 20, completedKm: 29, attributableKm: 14, extraKm: 15, pendingKm: 6, pct: 70 });
    expect(mergeLedgers(ledgers)[0]).toMatchObject({ weekStart: W1, targetKm: 20, coveredKm: 14, pendingKm: 6, pct: 70 });
  });

  it('calcula km y ritmo medio ponderado por mes con la distancia real', () => {
    const months = monthlySeries([run('2026-09-10', 10, 'u1', 3000), run('2026-09-20', 2, 'u1', 840), run('2026-10-02', 5)]);
    expect(months).toEqual([
      { month: '2026-09', km: 12, workouts: 2, pace: 320, cumKm: 12 },
      { month: '2026-10', km: 5, workouts: 1, pace: null, cumKm: 17 },
    ]);
  });
});
