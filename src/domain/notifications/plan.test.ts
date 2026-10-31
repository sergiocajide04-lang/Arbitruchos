import { describe, expect, it } from 'vitest';
import { addDays, weekStartOf } from '@/lib/dates';
import { lastWeekendWeek, planNotifications, type PlanInput, type PlanLogEntry, type PlanMatch, type PlanSettings, type PlanWorkout } from './plan';

// Temporada en Europe/Madrid (UTC+1 desde el 25-10-2026).
const SEASON = {
  id: 'season-1-uuid',
  group_id: 'g1',
  start_date: '2026-09-01',
  end_date: '2027-06-30',
  timezone: 'Europe/Madrid',
  status: 'active' as const,
  counted_activity_types: ['run' as const, 'treadmill' as const],
};
const TAG = SEASON.id.slice(0, 8);
const U = 'u1';
const MONDAY = '2026-10-26';

// Martes 27-10 a las 19:30 hora de Madrid (día y hora de recordatorio de km por defecto).
const TUESDAY_1930 = new Date('2026-10-27T18:30:00Z');
// Domingo 01-11 a las 20:30 (recordatorio de partido por defecto: domingo y lunes a las 20).
const SUNDAY_2030 = new Date('2026-11-01T19:30:00Z');

const goal = (week: string, km: number): PlanMatch => ({
  season_id: SEASON.id,
  referee_id: U,
  // Partido jugado el sábado anterior al lunes indicado: cuenta desde ese sábado a las 9:00.
  match_date: addDays(week, -2),
  target_km: km,
});
const run = (date: string, km: number): PlanWorkout => ({
  group_id: 'g1',
  user_id: U,
  activity_date: date,
  week_start: weekStartOf(date),
  distance_km: km,
  duration_s: null,
  activity_type: 'run',
  validation_status: 'confirmed',
});

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    now: TUESDAY_1930,
    groups: [{ id: 'g1', match_reminder_days: [7, 1], match_reminder_hour: 20 }],
    seasons: [SEASON],
    members: [{ group_id: 'g1', user_id: U, status: 'active' }],
    matches: [],
    workouts: [],
    settings: new Map(),
    subscribedUsers: new Set([U]),
    log: [],
    ...over,
  };
}
const kinds = (i: PlanInput) => planNotifications(i).map((n) => n.kind);

describe('recordatorios de kilómetros', () => {
  it('sin deuda no hay recordatorio', () => {
    expect(kinds(input({ matches: [goal(MONDAY, 10)], workouts: [run('2026-10-26', 10)] }))).toEqual([]);
  });

  it('con deuda recibe el recordatorio con los km pendientes reales', () => {
    const [n, ...rest] = planNotifications(input({ matches: [goal(MONDAY, 10)], workouts: [run('2026-10-26', 3.5)] }));
    expect(rest).toEqual([]);
    expect(n).toMatchObject({ kind: 'km_reminder', pendingKm: 6.5, periodKey: `${TAG}:2026-10-27` });
    expect(n!.body).toBe('REFRUN: Te quedan 6,5 km para completar tus objetivos pendientes.');
  });

  it('tiene en cuenta la deuda de semanas anteriores', () => {
    const n = planNotifications(input({ matches: [goal('2026-10-19', 10)], workouts: [run('2026-10-20', 4)] }));
    expect(n[0]).toMatchObject({ kind: 'km_reminder', pendingKm: 6 });
  });

  it('solo en sus días y desde su hora', () => {
    const base = { matches: [goal(MONDAY, 10)] };
    expect(kinds(input({ ...base, now: new Date('2026-10-27T17:30:00Z') }))).toEqual([]); // 18:30 < 19:00
    expect(kinds(input({ ...base, now: new Date('2026-10-28T18:30:00Z') }))).toEqual([]); // miércoles
    const custom = new Map<string, PlanSettings>([[U, { enabled: true, match_reminders: true, km_reminders: true, km_days: [3, 6], remind_hour: 9 }]]);
    expect(kinds(input({ ...base, settings: custom, now: new Date('2026-10-28T08:30:00Z') }))).toEqual(['km_reminder']);
  });

  it('nunca de noche', () => {
    const late = new Map<string, PlanSettings>([[U, { enabled: true, match_reminders: true, km_reminders: true, km_days: [2, 5], remind_hour: 22 }]]);
    expect(kinds(input({ matches: [goal(MONDAY, 10)], settings: late, now: new Date('2026-10-27T22:10:00Z') }))).toEqual([]); // 23:10
  });

  it('al completar los objetivos deja de recibir recordatorios y recibe una única felicitación', () => {
    const log: PlanLogEntry[] = [{ user_id: U, kind: 'km_reminder', period_key: `${TAG}:2026-10-27`, sent_at: '2026-10-27T18:30:05Z' }];
    const done = input({ matches: [goal(MONDAY, 10)], workouts: [run('2026-10-26', 10)], log, now: new Date('2026-10-28T10:00:00Z') });
    const [n, ...rest] = planNotifications(done);
    expect(rest).toEqual([]);
    expect(n).toMatchObject({ kind: 'km_done', body: 'REFRUN: ¡Ya estás al día! Has completado todos tus kilómetros pendientes.' });
    // Ya enviada: no se repite en ejecuciones posteriores.
    const after = { ...done, log: [...log, { user_id: U, kind: 'km_done', period_key: n!.periodKey, sent_at: '2026-10-28T10:00:05Z' }] };
    expect(kinds(after)).toEqual([]);
    expect(kinds({ ...after, now: new Date('2026-10-30T18:30:00Z') })).toEqual([]); // viernes, día de aviso
  });

  it('sin recordatorio previo no hay felicitación', () => {
    expect(kinds(input({ matches: [goal(MONDAY, 10)], workouts: [run('2026-10-26', 12)], now: new Date('2026-10-28T10:00:00Z') }))).toEqual([]);
  });
});

describe('recordatorio de registrar el partido', () => {
  it('el fin de semana de referencia es el último domingo', () => {
    expect(lastWeekendWeek('2026-11-01')).toBe('2026-10-26'); // domingo: ese mismo fin de semana
    expect(lastWeekendWeek('2026-11-02')).toBe('2026-10-26'); // lunes: el de ayer
  });

  it('si no ha registrado el partido, lo recuerda', () => {
    const n = planNotifications(input({ now: SUNDAY_2030 }));
    expect(n.map((x) => x.kind)).toEqual(['match_reminder']);
    expect(n[0]!.body).toBe('REFRUN: Recuerda registrar el resultado de tu primer partido del fin de semana para generar tu objetivo de kilómetros.');
  });

  it('si ya lo registró, no lo recuerda', () => {
    const m = { ...goal('2026-11-02', 12), match_date: '2026-10-31' };
    expect(kinds(input({ now: SUNDAY_2030, matches: [m] }))).toEqual([]);
  });

  it('respeta los días y la hora del grupo', () => {
    expect(kinds(input({ now: new Date('2026-11-01T18:30:00Z') }))).toEqual([]); // 19:30 < 20:00
    expect(kinds(input({ now: new Date('2026-11-03T19:30:00Z') }))).toEqual([]); // martes sin deuda
  });
});

describe('preferencias, permisos y duplicados', () => {
  it('con las notificaciones desactivadas no recibe nada', () => {
    const off = new Map<string, PlanSettings>([[U, { enabled: false, match_reminders: true, km_reminders: true, km_days: [2, 5], remind_hour: 19 }]]);
    expect(kinds(input({ settings: off, matches: [goal(MONDAY, 10)] }))).toEqual([]);
    expect(kinds(input({ settings: off, now: SUNDAY_2030 }))).toEqual([]);
  });

  it('cada tipo se puede desactivar por separado', () => {
    const noKm = new Map<string, PlanSettings>([[U, { enabled: true, match_reminders: true, km_reminders: false, km_days: [2, 5], remind_hour: 19 }]]);
    expect(kinds(input({ settings: noKm, matches: [goal(MONDAY, 10)] }))).toEqual([]);
    const noMatch = new Map<string, PlanSettings>([[U, { enabled: true, match_reminders: false, km_reminders: true, km_days: [2, 5], remind_hour: 19 }]]);
    expect(kinds(input({ settings: noMatch, now: SUNDAY_2030 }))).toEqual([]);
  });

  it('sin dispositivo suscrito (permiso no concedido) no se planifica nada', () => {
    expect(kinds(input({ subscribedUsers: new Set(), matches: [goal(MONDAY, 10)] }))).toEqual([]);
  });

  it('no repite un aviso ya enviado en el mismo periodo', () => {
    const log: PlanLogEntry[] = [{ user_id: U, kind: 'km_reminder', period_key: `${TAG}:2026-10-27`, sent_at: '2026-10-27T18:07:00Z' }];
    expect(kinds(input({ matches: [goal(MONDAY, 10)], log, now: new Date('2026-10-27T20:07:00Z') }))).toEqual([]);
  });

  it('miembros inactivos y temporadas no activas no reciben avisos', () => {
    expect(kinds(input({ members: [{ group_id: 'g1', user_id: U, status: 'inactive' }], matches: [goal(MONDAY, 10)] }))).toEqual([]);
    expect(kinds(input({ seasons: [{ ...SEASON, status: 'closed' }], matches: [goal(MONDAY, 10)] }))).toEqual([]);
  });
});
