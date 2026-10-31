/**
 * Decide QUÉ notificaciones tocan en este momento. Función pura: la usa el
 * envío programado (scripts/notify) con datos recién leídos de Supabase y la
 * cubren las pruebas. Los km pendientes salen de compliance.ts, el mismo
 * cálculo que muestran las pantallas.
 *
 * Reglas:
 *   - Solo temporadas activas y con la fecha local dentro de la temporada.
 *   - Nunca fuera de 08:00–22:59 (hora local de la temporada).
 *   - Solo usuarios activos del grupo, con avisos activados y algún dispositivo.
 *   - Partido: en los días/hora del grupo, si el usuario NO tiene partido con
 *     fecha en la semana del último fin de semana. Una vez por día configurado.
 *   - Km: en sus dos días y desde su hora, si tiene deuda real (> 0). Una vez al día.
 *   - Felicitación: una sola vez cuando la deuda llega a 0 después de haber
 *     recibido algún recordatorio de km (no se repite).
 *   - Cada aviso tiene una clave (usuario, tipo, periodo); si ya está en el
 *     registro de envíos, no se vuelve a planificar.
 */
import { buildWeeklyLedger, summarizeSeason, type MatchLike, type SeasonRules, type WorkoutLike } from '@/domain/calc/compliance';
import { addDays, isoWeekday, isWithin, todayInTimeZone, weekStartOf, type IsoDate } from '@/lib/dates';
import { formatKm } from '@/lib/format';

export type NotificationKind = 'match_reminder' | 'km_reminder' | 'km_done';

export const QUIET_BEFORE_HOUR = 8;
export const QUIET_AFTER_HOUR = 22;

export interface PlanGroup {
  id: string;
  match_reminder_days: number[];
  match_reminder_hour: number;
}

export interface PlanSeason extends SeasonRules {
  id: string;
  group_id: string;
  timezone: string;
  status: 'planned' | 'active' | 'closed';
}

export interface PlanMatch extends MatchLike {
  season_id: string;
  match_date: IsoDate;
}

export interface PlanWorkout extends WorkoutLike {
  group_id: string;
}

export interface PlanSettings {
  enabled: boolean;
  match_reminders: boolean;
  km_reminders: boolean;
  km_days: number[];
  remind_hour: number;
}

export interface PlanLogEntry {
  user_id: string;
  kind: string;
  period_key: string;
  sent_at: string;
}

export interface PlanInput {
  now: Date;
  groups: PlanGroup[];
  seasons: PlanSeason[];
  members: Array<{ group_id: string; user_id: string; status: string }>;
  matches: PlanMatch[];
  workouts: PlanWorkout[];
  /** Preferencias guardadas; quien no tenga fila usa DEFAULT_SETTINGS. */
  settings: Map<string, PlanSettings>;
  /** Usuarios con al menos un dispositivo suscrito. */
  subscribedUsers: Set<string>;
  log: PlanLogEntry[];
}

export interface PlannedNotification {
  userId: string;
  groupId: string;
  kind: NotificationKind;
  periodKey: string;
  title: string;
  body: string;
  /** Ruta de la app que abre la notificación. */
  path: string;
  pendingKm: number | null;
}

export const DEFAULT_SETTINGS: PlanSettings = {
  enabled: true,
  match_reminders: true,
  km_reminders: true,
  km_days: [2, 5],
  remind_hour: 19,
};

/** Hora local (0-23) en una zona horaria. */
export function hourInTimeZone(timeZone: string, now: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now);
  return Number(h);
}

/** Lunes de la semana del último fin de semana (el domingo más reciente, hoy incluido). */
export function lastWeekendWeek(today: IsoDate): IsoDate {
  const lastSunday = addDays(today, -(isoWeekday(today) % 7));
  return weekStartOf(lastSunday);
}

export function planNotifications(input: PlanInput): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const sent = new Set(input.log.map((l) => `${l.user_id}|${l.kind}|${l.period_key}`));
  const already = (user: string, kind: NotificationKind, key: string) => sent.has(`${user}|${kind}|${key}`);

  for (const season of input.seasons) {
    if (season.status !== 'active') continue;
    const group = input.groups.find((g) => g.id === season.group_id);
    if (!group) continue;

    const today = todayInTimeZone(season.timezone, input.now);
    if (!isWithin(today, season.start_date, season.end_date)) continue;
    const hour = hourInTimeZone(season.timezone, input.now);
    if (hour < QUIET_BEFORE_HOUR || hour > QUIET_AFTER_HOUR) continue;
    const dow = isoWeekday(today);
    const currentWeek = weekStartOf(today);
    const tag = season.id.slice(0, 8);

    const seasonMatches = input.matches.filter((m) => m.season_id === season.id);
    const groupWorkouts = input.workouts.filter((w) => w.group_id === season.group_id);
    const members = input.members.filter((m) => m.group_id === season.group_id && m.status === 'active');

    for (const { user_id: userId } of members) {
      if (!input.subscribedUsers.has(userId)) continue;
      const prefs = input.settings.get(userId) ?? DEFAULT_SETTINGS;
      if (!prefs.enabled) continue;

      // --- Recordatorio de registrar el partido -------------------------------
      if (prefs.match_reminders && group.match_reminder_days.includes(dow) && hour >= group.match_reminder_hour) {
        const refWeek = lastWeekendWeek(today);
        const refSunday = addDays(refWeek, 6);
        const weekendInSeason = refSunday >= season.start_date;
        const registered = seasonMatches.some(
          (m) => m.referee_id === userId && isWithin(m.match_date, refWeek, refSunday),
        );
        const key = `${tag}:${refWeek}:d${dow}`;
        if (weekendInSeason && !registered && !already(userId, 'match_reminder', key)) {
          out.push({
            userId,
            groupId: group.id,
            kind: 'match_reminder',
            periodKey: key,
            title: 'REFRUN',
            body: 'REFRUN: Recuerda registrar el resultado de tu primer partido del fin de semana para generar tu objetivo de kilómetros.',
            path: 'anadir/partido',
            pendingKm: null,
          });
        }
      }

      // --- Kilómetros pendientes ---------------------------------------------
      if (!prefs.km_reminders) continue;
      const ledger = buildWeeklyLedger(userId, seasonMatches, groupWorkouts, season, currentWeek);
      const summary = summarizeSeason(ledger);
      const pending = summary.pendingKm;

      if (pending > 0) {
        const key = `${tag}:${today}`;
        if (prefs.km_days.includes(dow) && hour >= prefs.remind_hour && !already(userId, 'km_reminder', key)) {
          out.push({
            userId,
            groupId: group.id,
            kind: 'km_reminder',
            periodKey: key,
            title: 'REFRUN',
            body: `REFRUN: Te quedan ${formatKm(pending, pending < 0.1)} km para completar tus objetivos pendientes.`,
            path: '',
            pendingKm: pending,
          });
        }
      } else if (summary.targetKm > 0) {
        // Felicitación única tras el último recordatorio de km de esta temporada.
        const mine = input.log
          .filter((l) => l.user_id === userId && l.period_key.startsWith(`${tag}:`))
          .sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1));
        const lastReminder = mine.find((l) => l.kind === 'km_reminder');
        const lastDone = mine.find((l) => l.kind === 'km_done');
        if (lastReminder && (!lastDone || lastDone.sent_at < lastReminder.sent_at)) {
          const key = `${tag}:done-after-${lastReminder.period_key.slice(tag.length + 1)}`;
          if (!already(userId, 'km_done', key)) {
            out.push({
              userId,
              groupId: group.id,
              kind: 'km_done',
              periodKey: key,
              title: 'REFRUN',
              body: 'REFRUN: ¡Ya estás al día! Has completado todos tus kilómetros pendientes.',
              path: '',
              pendingKm: 0,
            });
          }
        }
      }
    }
  }
  return out;
}
