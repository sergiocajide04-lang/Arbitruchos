/**
 * API simulada SOLO para el arnés visual de desarrollo (tests/visual).
 * Datos sintéticos deterministas; nunca se incluye en el build de producción.
 */
import type { Match, Workout } from '@/domain/types';
import { addDays, weekStartOf } from '@/lib/dates';
import { ANA, LUIS, ME } from '../ui/mocks';

const PABLO = '44444444-4444-4444-8444-444444444444';
const IRENE = '55555555-5555-4555-8555-555555555555';
export const extraMembers = [
  { id: PABLO, name: 'Pablo Ferrer', color: 'violet' as const },
  { id: IRENE, name: 'Irene Sanz', color: 'rose' as const },
];

const weeks = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
const refs = [ME, ANA, LUIS, PABLO, IRENE];
const scores: Record<string, Array<[number, number]>> = {
  [ME]: [[6, 3], [4, 7], [8, 2], [5, 5], [3, 4], [9, 1], [13, 1]],
  [ANA]: [[2, 2], [7, 5], [3, 1], [6, 6], [4, 2], [5, 3], [7, 4]],
  [LUIS]: [[10, 2], [3, 3], [5, 4], [2, 1], [8, 5], [4, 4], [6, 2]],
  [PABLO]: [[1, 0], [4, 4], [6, 3], [3, 2], [5, 6], [2, 2], [9, 3]],
  [IRENE]: [[5, 1], [2, 2], [4, 6], [7, 3], [3, 3], [6, 1], [4, 5]],
};
const effort: Record<string, number> = { [ME]: 0.92, [ANA]: 1.08, [LUIS]: 0.78, [PABLO]: 0.64, [IRENE]: 0.99 };

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const matches: Match[] = [];
const workouts: Workout[] = [];
for (const r of refs) {
  weeks.forEach((w, i) => {
    const [h, a] = scores[r]![i]!;
    // Tarjetas sintéticas (vista previa): 0-3 amarillas, alguna azul y alguna roja.
    const y = (i + h) % 4;
    const b = (i + a) % 3 === 0 ? 1 : 0;
    const red = i === 4 && h > 5 ? 1 : 0;
    matches.push({
      id: `m-${r}-${i}`,
      group_id: 'g1',
      season_id: 's1',
      referee_id: r,
      match_date: addDays(w, -2),
      week_start: w,
      competition: i % 2 ? 'OK Liga Plata' : 'Primera Nacional',
      home_team: null,
      away_team: null,
      home_goals: h,
      away_goals: a,
      yellow_cards: y,
      blue_cards: b,
      red_cards: red,
      target_km: h + a + y + 2 * b + 5 * red,
      notes: null,
      change_reason: null,
      created_by: r,
      created_at: `${addDays(w, -1)}T20:00:00Z`,
      updated_at: `${addDays(w, -1)}T20:00:00Z`,
    });
    const target = h + a;
    let remaining = target * effort[r]! * (0.8 + rand() * 0.35);
    if (w === '2026-10-19') remaining *= 0.6; // semana en curso
    let d = 0;
    while (remaining > 0.5 && d < 6) {
      const km = Math.min(remaining, 4 + Math.round(rand() * 60) / 10);
      const pace = 290 + Math.round(rand() * 60);
      const date = addDays(w, d + 1);
      workouts.push({
        id: `w-${r}-${i}-${d}`,
        group_id: 'g1',
        user_id: r,
        activity_date: date,
        activity_time: '07:30',
        week_start: weekStartOf(date),
        activity_type: d % 3 === 2 ? 'treadmill' : 'run',
        source: (['strava', 'apple', 'gym_console'] as const)[d % 3]!,
        entry_method: 'ocr',
        distance_value: Math.round(km * 100) / 100,
        distance_unit: 'km',
        distance_km: Math.round(km * 100) / 100,
        duration_s: Math.round(km * pace),
        avg_pace_s_per_km: pace,
        avg_speed_kmh: null,
        calories: null,
        calories_kind: null,
        validation_status: 'confirmed',
        review_note: null,
        fingerprint: `fp-${r}-${i}-${d}`,
        client_request_id: `c-${r}-${i}-${d}`,
        details: {},
        created_at: `${date}T09:00:00Z`,
        updated_at: `${date}T09:00:00Z`,
      });
      remaining -= km;
      d += 2;
    }
  });
}
matches.sort((a, b) => (a.week_start < b.week_start ? 1 : -1));
workouts.sort((a, b) => (a.activity_date < b.activity_date ? 1 : -1));

const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 50));

export const listMatches = async () => delay(matches);
export const listWorkouts = async () => delay(workouts);
export const getWorkout = async (id: string) => delay(workouts.find((w) => w.id === id) ?? null);
export const listAudit = async () => delay([]);
export const listInvitations = async () => delay([]);
export const findSimilarWorkouts = async () => delay([]);
const noop = async () => delay(undefined as never);
export const createMatch = noop;
export const updateMatch = noop;
export const deleteMatch = noop;
export const createWorkout = noop;
export const updateWorkout = noop;
export const deleteWorkout = noop;
export const moderateWorkout = noop;
export const signIn = noop;
export const signUp = noop;
export const signOut = noop;
export const sendPasswordReset = noop;
export const updatePassword = noop;
export const updateMyProfile = noop;
export const createInvitation = noop;
export const revokeInvitation = noop;
export const updateMember = noop;
export const updateGroup = noop;
export const createSeason = noop;
export const updateSeason = noop;
export const acceptInvitation = noop;
export const createGroup = noop;

// Notificaciones (vista previa: sin dispositivos ni envíos reales).
export const DEFAULT_NOTIFICATION_SETTINGS = { enabled: true, match_reminders: true, km_reminders: true, km_days: [2, 5], remind_hour: 19 };
export const getNotificationSettings = async (userId: string) => delay({ user_id: userId, ...DEFAULT_NOTIFICATION_SETTINGS });
export const saveNotificationSettings = noop;
export const listMyDevices = async () => delay([]);
export const listMyNotifications = async () => delay([]);
export const registerPushSubscription = noop;
export const deletePushSubscription = noop;
export const deletePushDevice = noop;
