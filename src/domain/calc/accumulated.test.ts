import { describe, expect, it } from 'vitest';
import { weekStartOf } from '@/lib/dates';
import { buildWeeklyLedger, combineSummaries, mergeLedgers, summarizeSeason, type MatchLike, type SeasonRules, type WorkoutLike } from './compliance';
import { monthlySeries } from '@/features/stats/series';

const season: SeasonRules = {
  start_date: '2026-09-01',
  end_date: '2027-06-30',
  compliance_policy: 'season_total',
  counted_activity_types: ['run', 'treadmill'],
};

const w = (user: string, date: string, km: number, durationS: number | null = null): WorkoutLike => ({
  user_id: user,
  activity_date: date,
  week_start: weekStartOf(date),
  distance_km: km,
  duration_s: durationS,
  activity_type: 'run',
  validation_status: 'confirmed',
});

describe('temporada acumulada (metodología por defecto)', () => {
  const matches: MatchLike[] = [
    { referee_id: 'u1', week_start: '2026-10-05', target_km: 14 }, // 13-1
    { referee_id: 'u1', week_start: '2026-10-12', target_km: 25 }, // 25-0
    { referee_id: 'u1', week_start: '2026-10-19', target_km: 11 }, // 4-7
  ];

  it('suma objetivos y km de todas las semanas', () => {
    // 30 km una semana y 5 la siguiente: el exceso cuenta para el total.
    const workouts = [w('u1', '2026-10-06', 30), w('u1', '2026-10-13', 5), w('u1', '2026-10-20', 4)];
    const s = summarizeSeason(buildWeeklyLedger('u1', matches, workouts, season, '2026-10-19'), 'season_total');
    expect(s.targetKm).toBe(50);
    expect(s.completedKm).toBe(39);
    expect(s.pendingKm).toBe(11);
    expect(s.pct).toBeCloseTo(78, 6);
  });

  it('el exceso adelantado también cuenta para objetivos posteriores', () => {
    const workouts = [w('u1', '2026-10-06', 50)];
    const s = summarizeSeason(buildWeeklyLedger('u1', matches, workouts, season, '2026-10-19'), 'season_total');
    expect(s.pendingKm).toBe(0);
    expect(s.pct).toBe(100);
  });

  it('el partido ya registrado para la semana siguiente suma al objetivo acumulado', () => {
    const s = summarizeSeason(buildWeeklyLedger('u1', matches, [], season, '2026-10-12'), 'season_total');
    expect(s.targetKm).toBe(50);
    expect(s.upcomingTargetKm).toBe(11);
  });

  it('puede superar el 100 % y muestra los km de más', () => {
    const s = summarizeSeason(buildWeeklyLedger('u1', matches, [w('u1', '2026-10-06', 60)], season, '2026-10-19'), 'season_total');
    expect(s.pct).toBe(120);
    expect(s.extraKm).toBe(10);
  });

  it('suma los totales de todo el grupo', () => {
    const all: MatchLike[] = [...matches, { referee_id: 'u2', week_start: '2026-10-05', target_km: 10 }];
    const workouts = [w('u1', '2026-10-06', 20), w('u2', '2026-10-06', 5)];
    const ledgers = ['u1', 'u2'].map((u) => buildWeeklyLedger(u, all, workouts, season, '2026-10-19'));
    const total = combineSummaries(ledgers.map((l) => summarizeSeason(l, 'season_total')));
    expect(total.targetKm).toBe(60);
    expect(total.completedKm).toBe(25);
    expect(total.pendingKm).toBe(35);
    const merged = mergeLedgers(ledgers);
    expect(merged.find((x) => x.weekStart === '2026-10-05')).toMatchObject({ targetKm: 24, completedKm: 25 });
  });

  it('calcula km y ritmo medio ponderado por mes', () => {
    const months = monthlySeries([w('u1', '2026-09-10', 10, 3000), w('u1', '2026-09-20', 2, 840), w('u1', '2026-10-02', 5, null)]);
    expect(months).toEqual([
      { month: '2026-09', km: 12, workouts: 2, pace: 320, cumKm: 12 },
      { month: '2026-10', km: 5, workouts: 1, pace: null, cumKm: 17 },
    ]);
  });
});
