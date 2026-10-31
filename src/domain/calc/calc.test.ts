import { describe, expect, it } from 'vitest';
import { parseGoals, previewTarget, targetFromScore } from './goals';
import {
  buildWeeklyLedger,
  cappedPct,
  isCountable,
  summarizeSeason,
  type MatchLike,
  type SeasonRules,
  type WorkoutLike,
} from './compliance';
import { aggregatePace, bestPace, workoutStats } from './stats';
import { buildRanking, sortRanking } from './ranking';
import {
  checkPaceConsistency,
  parseDecimalInput,
  parseDurationInput,
  parsePaceInput,
  toKm,
  workoutFingerprint,
} from './workout';
import { weekStartOf } from '@/lib/dates';

const season: SeasonRules = {
  start_date: '2026-09-01',
  end_date: '2027-06-30',
  counted_activity_types: ['run', 'treadmill'],
};

function workout(partial: Partial<WorkoutLike> & { activity_date: string; distance_km: number }): WorkoutLike {
  return {
    user_id: 'u1',
    duration_s: null,
    activity_type: 'run',
    validation_status: 'confirmed',
    week_start: weekStartOf(partial.activity_date),
    ...partial,
  };
}

// Periodos de competición (sábado 9:00 → sábado 8:59). Los partidos se juegan ese sábado.
const W1 = '2026-10-17';
const W2 = '2026-10-24';
const W3 = '2026-10-31';

describe('objetivo de un partido', () => {
  it.each([
    [13, 1, 14],
    [25, 0, 25],
    [4, 7, 11],
    [0, 0, 0],
  ])('%i-%i genera %i km', (a, b, km) => {
    expect(targetFromScore(a, b)).toBe(km);
  });

  it('rechaza valores negativos', () => {
    expect(() => targetFromScore(-1, 3)).toThrow(RangeError);
    expect(parseGoals('-2')).toEqual({ ok: false, error: 'Los goles no pueden ser negativos' });
  });

  it('rechaza decimales y textos', () => {
    expect(parseGoals('2.5').ok).toBe(false);
    expect(parseGoals('dos').ok).toBe(false);
    expect(() => targetFromScore(1.5, 2)).toThrow();
  });

  it('un campo vacío no se convierte en cero', () => {
    expect(parseGoals('')).toEqual({ ok: false, error: 'Introduce los goles' });
    expect(parseGoals('   ').ok).toBe(false);
    expect(parseGoals(null).ok).toBe(false);
    expect(previewTarget('13', '')).toBeNull();
  });

  it('previsualiza resultado y objetivo', () => {
    expect(previewTarget('13', '1')).toMatchObject({ score: '13-1', goalsKm: 14, cardsKm: 0, target: 14 });
  });
});

describe('semana (libro con asignación de km)', () => {
  it('objetivo 14 km con carreras de 5 y 4 km deja 5 km pendientes', () => {
    const matches: MatchLike[] = [{ referee_id: 'u1', match_date: W1, target_km: 14 }];
    const workouts = [workout({ activity_date: '2026-10-20', distance_km: 5 }), workout({ activity_date: '2026-10-22', distance_km: 4 })];
    const [week] = buildWeeklyLedger('u1', matches, workouts, season, W1);
    expect(week).toMatchObject({ targetKm: 14, completedKm: 9, validKm: 9, pendingKm: 5, met: false, workoutCount: 2 });
    expect(week!.pct).toBeCloseTo(64.2857, 3);
  });

  it('el porcentaje nunca supera el 100 % y un objetivo cero no divide por cero', () => {
    expect(cappedPct(7, 14)).toBe(50);
    expect(cappedPct(29, 10)).toBe(100);
    expect(cappedPct(5, 0)).toBeNull();
    expect(summarizeSeason([]).pct).toBeNull();
  });

  it('los km de más se muestran como corridos, pero no como válidos', () => {
    const matches: MatchLike[] = [{ referee_id: 'u1', match_date: W1, target_km: 10 }];
    const workouts = [workout({ activity_date: '2026-10-20', distance_km: 12.5 })];
    const [week] = buildWeeklyLedger('u1', matches, workouts, season, W1);
    expect(week).toMatchObject({ completedKm: 12.5, validKm: 10, excessKm: 2.5, pendingKm: 0, met: true, pct: 100 });
  });

  it('solo cuentan entrenamientos confirmados, de tipos computables y dentro de la temporada', () => {
    expect(isCountable(workout({ activity_date: '2026-10-20', distance_km: 5 }), season)).toBe(true);
    expect(isCountable(workout({ activity_date: '2026-10-20', distance_km: 5, validation_status: 'pending' }), season)).toBe(false);
    expect(isCountable(workout({ activity_date: '2026-10-20', distance_km: 5, validation_status: 'rejected' }), season)).toBe(false);
    expect(isCountable(workout({ activity_date: '2026-10-20', distance_km: 5, activity_type: 'bike' }), season)).toBe(false);
    expect(isCountable(workout({ activity_date: '2026-08-20', distance_km: 5 }), season)).toBe(false);
  });

  it('suma varios partidos asignados a la misma semana', () => {
    const matches: MatchLike[] = [
      { referee_id: 'u1', match_date: W1, target_km: 6 },
      { referee_id: 'u1', match_date: W1, target_km: 4 },
      { referee_id: 'u2', match_date: W1, target_km: 30 },
    ];
    const [week] = buildWeeklyLedger('u1', matches, [], season, W1);
    expect(week).toMatchObject({ targetKm: 10, matchCount: 2 });
  });

  it('suma decimales sin errores de coma flotante visibles', () => {
    const matches: MatchLike[] = [{ referee_id: 'u1', match_date: W1, target_km: 1 }];
    const workouts = [0.1, 0.2, 0.7].map((km, i) => workout({ activity_date: `2026-10-2${i}`, distance_km: km }));
    const [week] = buildWeeklyLedger('u1', matches, workouts, season, W1);
    expect(week!.completedKm).toBe(1);
    expect(week!.met).toBe(true);
    expect(week!.excessKm).toBe(0);
  });
});

describe('cumplimiento de temporada', () => {
  const matches: MatchLike[] = [
    { referee_id: 'u1', match_date: W1, target_km: 10 },
    { referee_id: 'u1', match_date: W2, target_km: 20 },
    { referee_id: 'u1', match_date: W3, target_km: 8 },
  ];
  const workouts = [
    workout({ activity_date: '2026-10-20', distance_km: 6 }), // W1: 6/10 (deuda 4)
    workout({ activity_date: '2026-10-27', distance_km: 26 }), // W2: paga 4 de deuda + 20 + 2 de excedente
  ];

  it('no es la media de porcentajes semanales sino km válidos / obligaciones', () => {
    const s = summarizeSeason(buildWeeklyLedger('u1', matches, workouts, season, W2));
    expect(s.targetKm).toBe(30);
    expect(s.attributableKm).toBe(30);
    expect(s.pct).toBe(100);
    expect(s.completedKm).toBe(32);
    expect(s.extraKm).toBe(2);
    expect(s.pendingKm).toBe(0);
  });

  it('las semanas futuras no cuentan todavía ni reciben km', () => {
    const weeks = buildWeeklyLedger('u1', matches, workouts, season, W2);
    expect(summarizeSeason(weeks).upcomingTargetKm).toBe(8);
    expect(weeks.find((w) => w.weekStart === W3)).toMatchObject({ phase: 'upcoming', coveredKm: 0, pendingKm: 8 });
  });

  it('editar un partido recalcula objetivos de forma coherente', () => {
    const corrected = matches.map((m) => (m.match_date === W1 ? { ...m, target_km: 6 } : m));
    const after = summarizeSeason(buildWeeklyLedger('u1', corrected, workouts, season, W2));
    expect(after.targetKm).toBe(26);
    expect(after.pct).toBe(100);
    expect(after.attributableKm).toBe(26);
    expect(after.extraKm).toBe(6);
    expect(after.completedKm).toBe(32);
  });
});

describe('estadísticas', () => {
  it('el ritmo medio es distancia total / tiempo total, no la media de ritmos', () => {
    const ws = [
      { distance_km: 10, duration_s: 3000 }, // 5:00
      { distance_km: 2, duration_s: 840 }, // 7:00
    ];
    // media simple = 6:00 (360 s); correcto = 3840 / 12 = 320 s (5:20)
    expect(aggregatePace(ws)).toBe(320);
  });

  it('ignora entrenamientos sin duración para el ritmo', () => {
    expect(aggregatePace([{ distance_km: 10, duration_s: null }])).toBeNull();
    expect(aggregatePace([{ distance_km: 10, duration_s: null }, { distance_km: 5, duration_s: 1500 }])).toBe(300);
  });

  it('el mejor ritmo exige al menos 1 km', () => {
    const best = bestPace([
      { distance_km: 0.4, duration_s: 80 },
      { distance_km: 5, duration_s: 1450 },
      { distance_km: 8, duration_s: 2500 },
    ]);
    expect(best!.pace).toBe(290);
  });

  it('resume totales y medias', () => {
    const s = workoutStats([
      { distance_km: 5, duration_s: 1500 },
      { distance_km: 7, duration_s: null },
    ]);
    expect(s).toMatchObject({ count: 2, totalKm: 12, avgKm: 6, longestKm: 7, totalDurationS: 1500, avgDurationS: 1500, timedCount: 1 });
  });
});

describe('clasificación', () => {
  it('ordena por cumplimiento relativo y no por distancia absoluta', () => {
    const matches: MatchLike[] = [
      { referee_id: 'a', match_date: W1, target_km: 100 },
      { referee_id: 'b', match_date: W1, target_km: 50 },
    ];
    const ws = [
      workout({ user_id: 'a', activity_date: '2026-10-20', distance_km: 80 }),
      workout({ user_id: 'b', activity_date: '2026-10-20', distance_km: 45 }),
    ];
    const rows = buildRanking(['a', 'b', 'c'], matches, ws, season, W1);
    expect(sortRanking(rows, 'pct_desc').map((r) => r.userId)).toEqual(['b', 'a', 'c']);
    expect(sortRanking(rows, 'pct_asc').map((r) => r.userId)).toEqual(['a', 'b', 'c']);
    expect(sortRanking(rows, 'km_desc').map((r) => r.userId)).toEqual(['a', 'b', 'c']);
    expect(sortRanking(rows, 'pending_asc').map((r) => r.userId)).toEqual(['c', 'b', 'a']);
    expect(rows.find((r) => r.userId === 'a')!.summary.pct).toBe(80);
    expect(rows.find((r) => r.userId === 'b')!.summary.pct).toBe(90);
  });

  it('los km excedentes no dan ventaja: a igual 100 % no gana quien corrió más', () => {
    const matches: MatchLike[] = [
      { referee_id: 'a', match_date: W1, target_km: 10 },
      { referee_id: 'b', match_date: W1, target_km: 20 },
    ];
    const ws = [
      workout({ user_id: 'a', activity_date: '2026-10-20', distance_km: 60 }),
      workout({ user_id: 'b', activity_date: '2026-10-20', distance_km: 20 }),
    ];
    const rows = buildRanking(['a', 'b'], matches, ws, season, W1);
    for (const r of rows) expect(r.summary.pct).toBe(100);
    // Desempate por km VÁLIDOS (20 > 10), no por km corridos (60 > 20).
    expect(sortRanking(rows, 'pct_desc').map((r) => r.userId)).toEqual(['b', 'a']);
  });
});

describe('normalización de entrenamientos', () => {
  it('convierte unidades', () => {
    expect(toKm(301, 'm')).toBeCloseTo(0.301);
    expect(toKm(8.42, 'km')).toBe(8.42);
    expect(toKm(1, 'mi')).toBeCloseTo(1.609344);
  });

  it('interpreta entradas manuales', () => {
    expect(parseDecimalInput('8,42')).toBe(8.42);
    expect(parseDecimalInput('8.42')).toBe(8.42);
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDurationInput('00:29:28')).toBe(1768);
    expect(parseDurationInput('48:35')).toBe(2915);
    expect(parseDurationInput('45')).toBe(2700);
    expect(parseDurationInput('10:75')).toBeNull();
    expect(parseDurationInput('')).toBeNull();
    expect(parsePaceInput('5:46')).toBe(346);
    expect(parsePaceInput('5:99')).toBeNull();
  });

  it('valida la coherencia entre distancia, duración y ritmo', () => {
    expect(checkPaceConsistency(8.42, 2911, 346).consistent).toBe(true);
    expect(checkPaceConsistency(8.42, 2911, 280).consistent).toBe(false);
  });

  it('genera huellas estables para avisar de duplicados', () => {
    const a = workoutFingerprint({ activityDate: '2026-10-20', distanceKm: 8.421, durationS: 2911 });
    const b = workoutFingerprint({ activityDate: '2026-10-20', distanceKm: 8.418, durationS: 2911 });
    expect(a).toBe(b);
    expect(workoutFingerprint({ activityDate: '2026-10-20', distanceKm: 8.42, durationS: null })).toContain('na');
  });
});
