/**
 * Acceso a datos (Supabase). Las pantallas no llaman a Supabase directamente:
 * todo pasa por aquí para mantener columnas, tipos y errores en un solo sitio.
 * Los permisos reales los imponen RLS y los triggers de la base de datos.
 */
import type {
  ActivityType,
  AuditEvent,
  AvatarColor,
  CaloriesKind,
  DistanceUnit,
  EntryMethod,
  Group,
  Invitation,
  Match,
  MemberRole,
  MemberStatus,
  MemberWithProfile,
  Profile,
  Season,
  SeasonStatus,
  ValidationStatus,
  Workout,
  WorkoutDetails,
  WorkoutSource,
} from '@/domain/types';
import type { IsoDate } from '@/lib/dates';
import { appUrl, getSupabase } from '@/lib/supabase';

const db = () => getSupabase();

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------
export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function signUp(email: string, password: string, displayName: string) {
  const { data, error } = await db().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName.trim() }, emailRedirectTo: appUrl('') },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function sendPasswordReset(email: string) {
  const { error } = await db().auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('restablecer') });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await db().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await db().auth.signOut();
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Perfiles
// ---------------------------------------------------------------------------
const PROFILE_COLS = 'id, display_name, avatar_color, created_at';

export async function getProfile(id: string): Promise<Profile | null> {
  return check(await db().from('profiles').select(PROFILE_COLS).eq('id', id).maybeSingle()) as Profile | null;
}

export async function updateMyProfile(id: string, patch: { display_name?: string; avatar_color?: AvatarColor }) {
  return check(await db().from('profiles').update(patch).eq('id', id).select(PROFILE_COLS).single()) as Profile;
}

// ---------------------------------------------------------------------------
// Grupos y miembros
// ---------------------------------------------------------------------------
export interface Membership {
  group: Group;
  role: MemberRole;
}

export async function listMyMemberships(userId: string): Promise<Membership[]> {
  const rows = check(
    await db()
      .from('group_members')
      .select('role, status, group:groups(id, name, timezone, match_reminder_days, match_reminder_hour, created_by, created_at)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('joined_at'),
  ) as unknown as Array<{ role: MemberRole; group: Group | null }>;
  return rows.filter((r) => r.group).map((r) => ({ group: r.group!, role: r.role }));
}

export async function createGroup(name: string, timezone: string): Promise<string> {
  return check(await db().rpc('create_group', { p_name: name, p_timezone: timezone })) as string;
}

export async function acceptInvitation(code: string): Promise<string> {
  return check(await db().rpc('accept_invitation', { p_code: code })) as string;
}

export async function updateGroup(
  id: string,
  patch: { name?: string; timezone?: string; match_reminder_days?: number[]; match_reminder_hour?: number },
) {
  check(await db().from('groups').update(patch).eq('id', id));
}

export async function listMembers(groupId: string): Promise<MemberWithProfile[]> {
  return check(
    await db()
      .from('group_members')
      .select(`group_id, user_id, role, status, joined_at, profile:profiles(${PROFILE_COLS})`)
      .eq('group_id', groupId)
      .order('joined_at'),
  ) as unknown as MemberWithProfile[];
}

export async function updateMember(groupId: string, userId: string, patch: { role?: MemberRole; status?: MemberStatus }) {
  const rows = check(
    await db().from('group_members').update(patch).eq('group_id', groupId).eq('user_id', userId).select('user_id'),
  ) as unknown[];
  if (rows.length === 0) throw new Error('No tienes permiso para modificar este miembro.');
}

// ---------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------
const INVITE_COLS = 'id, group_id, code_hint, role, max_uses, use_count, expires_at, revoked_at, note, created_by, created_at';

export async function listInvitations(groupId: string): Promise<Invitation[]> {
  return check(
    await db().from('invitations').select(INVITE_COLS).eq('group_id', groupId).order('created_at', { ascending: false }).limit(30),
  ) as Invitation[];
}

export async function createInvitation(input: {
  groupId: string;
  role: Exclude<MemberRole, 'owner'>;
  maxUses: number;
  validDays: number;
  note?: string;
}): Promise<{ id: string; code: string; expires_at: string }> {
  const rows = check(
    await db().rpc('create_invitation', {
      p_group_id: input.groupId,
      p_role: input.role,
      p_max_uses: input.maxUses,
      p_valid_days: input.validDays,
      p_note: input.note ?? null,
    }),
  ) as Array<{ id: string; code: string; expires_at: string }>;
  const row = rows[0];
  if (!row) throw new Error('No se ha podido crear la invitación.');
  return row;
}

export async function revokeInvitation(id: string) {
  check(await db().from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', id));
}

// ---------------------------------------------------------------------------
// Temporadas
// ---------------------------------------------------------------------------
const SEASON_COLS =
  'id, group_id, name, start_date, end_date, timezone, status, compliance_policy, counted_activity_types, manual_requires_review, created_by, created_at';

export async function listSeasons(groupId: string): Promise<Season[]> {
  return check(
    await db().from('seasons').select(SEASON_COLS).eq('group_id', groupId).order('start_date', { ascending: false }),
  ) as Season[];
}

export interface SeasonInput {
  name: string;
  start_date: IsoDate;
  end_date: IsoDate;
  timezone: string;
  status: SeasonStatus;
  counted_activity_types: ActivityType[];
  manual_requires_review: boolean;
}

export async function createSeason(groupId: string, input: SeasonInput): Promise<Season> {
  return check(await db().from('seasons').insert({ group_id: groupId, ...input }).select(SEASON_COLS).single()) as Season;
}

export async function updateSeason(id: string, patch: Partial<SeasonInput>): Promise<Season> {
  return check(await db().from('seasons').update(patch).eq('id', id).select(SEASON_COLS).single()) as Season;
}

// ---------------------------------------------------------------------------
// Partidos
// ---------------------------------------------------------------------------
const MATCH_COLS =
  'id, group_id, season_id, referee_id, match_date, week_start, competition, home_team, away_team, home_goals, away_goals, yellow_cards, blue_cards, red_cards, target_km, notes, change_reason, created_by, created_at, updated_at';

export async function listMatches(seasonId: string): Promise<Match[]> {
  return check(
    await db().from('matches').select(MATCH_COLS).eq('season_id', seasonId).order('week_start', { ascending: false }),
  ) as Match[];
}

export interface MatchInput {
  referee_id: string;
  match_date: IsoDate;
  week_start: IsoDate;
  competition: string | null;
  home_team: string | null;
  away_team: string | null;
  home_goals: number;
  away_goals: number;
  yellow_cards: number;
  blue_cards: number;
  red_cards: number;
  notes: string | null;
}

export async function createMatch(groupId: string, seasonId: string, input: MatchInput): Promise<Match> {
  return check(
    await db().from('matches').insert({ group_id: groupId, season_id: seasonId, ...input }).select(MATCH_COLS).single(),
  ) as Match;
}

export async function updateMatch(id: string, patch: Partial<MatchInput> & { change_reason: string }): Promise<Match> {
  const rows = check(await db().from('matches').update(patch).eq('id', id).select(MATCH_COLS)) as Match[];
  if (!rows[0]) throw new Error('No tienes permiso para corregir este partido (solo administradores, o su autor durante 30 minutos).');
  return rows[0];
}

export async function deleteMatch(id: string) {
  const rows = check(await db().from('matches').delete().eq('id', id).select('id')) as unknown[];
  if (rows.length === 0) throw new Error('No tienes permiso para eliminar este partido.');
}

// ---------------------------------------------------------------------------
// Entrenamientos
// ---------------------------------------------------------------------------
const WORKOUT_COLS =
  'id, group_id, user_id, activity_date, activity_time, week_start, activity_type, source, entry_method, distance_value, distance_unit, distance_km, duration_s, avg_pace_s_per_km, avg_speed_kmh, calories, calories_kind, validation_status, review_note, fingerprint, client_request_id, details, created_at, updated_at';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function normalizeWorkout(raw: Record<string, unknown>): Workout {
  return {
    ...(raw as unknown as Workout),
    distance_value: Number(raw.distance_value),
    distance_km: Number(raw.distance_km),
    duration_s: num(raw.duration_s),
    avg_pace_s_per_km: num(raw.avg_pace_s_per_km),
    avg_speed_kmh: num(raw.avg_speed_kmh),
    calories: num(raw.calories),
    activity_time: (raw.activity_time as string | null)?.slice(0, 5) ?? null,
    details: (raw.details as WorkoutDetails) ?? {},
  };
}

export async function listWorkouts(groupId: string, from: IsoDate, to: IsoDate): Promise<Workout[]> {
  const rows = check(
    await db()
      .from('workouts')
      .select(WORKOUT_COLS)
      .eq('group_id', groupId)
      .gte('activity_date', from)
      .lte('activity_date', to)
      .order('activity_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5000),
  ) as Array<Record<string, unknown>>;
  return rows.map(normalizeWorkout);
}

export async function getWorkout(id: string): Promise<Workout | null> {
  const row = check(await db().from('workouts').select(WORKOUT_COLS).eq('id', id).maybeSingle()) as Record<string, unknown> | null;
  return row ? normalizeWorkout(row) : null;
}

export interface WorkoutInput {
  activity_date: IsoDate;
  activity_time: string | null;
  activity_type: ActivityType;
  source: WorkoutSource;
  entry_method: EntryMethod;
  distance_value: number;
  distance_unit: DistanceUnit;
  distance_km: number;
  duration_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_speed_kmh: number | null;
  calories: number | null;
  calories_kind: CaloriesKind | null;
  fingerprint: string;
  details: WorkoutDetails;
}

export async function createWorkout(groupId: string, clientRequestId: string, input: WorkoutInput): Promise<Workout> {
  const row = check(
    await db()
      .from('workouts')
      .insert({ group_id: groupId, client_request_id: clientRequestId, ...input })
      .select(WORKOUT_COLS)
      .single(),
  ) as Record<string, unknown>;
  return normalizeWorkout(row);
}

export async function updateWorkout(id: string, patch: Partial<WorkoutInput>): Promise<Workout> {
  const rows = check(await db().from('workouts').update(patch).eq('id', id).select(WORKOUT_COLS)) as Array<Record<string, unknown>>;
  if (!rows[0]) throw new Error('No tienes permiso para editar este entrenamiento.');
  return normalizeWorkout(rows[0]);
}

export async function moderateWorkout(id: string, status: ValidationStatus, note: string | null) {
  const rows = check(
    await db().from('workouts').update({ validation_status: status, review_note: note }).eq('id', id).select('id'),
  ) as unknown[];
  if (rows.length === 0) throw new Error('No tienes permiso para moderar este entrenamiento.');
}

export async function deleteWorkout(id: string) {
  const rows = check(await db().from('workouts').delete().eq('id', id).select('id')) as unknown[];
  if (rows.length === 0) throw new Error('No tienes permiso para eliminar este entrenamiento.');
}

/** Entrenamientos propios con la misma huella (posibles duplicados). */
export async function findSimilarWorkouts(groupId: string, userId: string, fingerprint: string, excludeId?: string) {
  let q = db()
    .from('workouts')
    .select('id, activity_date, distance_km, duration_s, source, created_at')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('fingerprint', fingerprint)
    .limit(5);
  if (excludeId) q = q.neq('id', excludeId);
  return check(await q) as Array<Pick<Workout, 'id' | 'activity_date' | 'distance_km' | 'duration_s' | 'source' | 'created_at'>>;
}

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------
export async function listAudit(groupId: string, limit = 100): Promise<AuditEvent[]> {
  return check(
    await db()
      .from('audit_events')
      .select('id, group_id, actor_id, entity_type, entity_id, action, reason, before, after, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as AuditEvent[];
}

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------
export interface NotificationSettings {
  user_id: string;
  enabled: boolean;
  match_reminders: boolean;
  km_reminders: boolean;
  /** Dos días ISO distintos (1 = lunes … 7 = domingo). */
  km_days: number[];
  remind_hour: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: Omit<NotificationSettings, 'user_id'> = {
  enabled: true,
  match_reminders: true,
  km_reminders: true,
  km_days: [2, 5],
  remind_hour: 19,
};

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  const row = check(
    await db().from('notification_settings').select('user_id, enabled, match_reminders, km_reminders, km_days, remind_hour').eq('user_id', userId).maybeSingle(),
  ) as NotificationSettings | null;
  return row ?? { user_id: userId, ...DEFAULT_NOTIFICATION_SETTINGS };
}

export async function saveNotificationSettings(userId: string, patch: Omit<NotificationSettings, 'user_id'>) {
  check(await db().from('notification_settings').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' }));
}

export interface PushDevice {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_success_at: string | null;
  last_error: string | null;
}

export async function listMyDevices(userId: string): Promise<PushDevice[]> {
  return check(
    await db()
      .from('push_subscriptions')
      .select('id, endpoint, user_agent, created_at, last_success_at, last_error')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ) as PushDevice[];
}

export async function registerPushSubscription(sub: { endpoint: string; p256dh: string; auth: string; userAgent: string | null }) {
  check(
    await db().rpc('register_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: sub.p256dh,
      p_auth: sub.auth,
      p_user_agent: sub.userAgent,
    }),
  );
}

export async function deletePushSubscription(endpoint: string) {
  check(await db().from('push_subscriptions').delete().eq('endpoint', endpoint));
}

export async function deletePushDevice(id: string) {
  check(await db().from('push_subscriptions').delete().eq('id', id));
}

export interface NotificationLogEntry {
  id: number;
  kind: string;
  title: string;
  body: string;
  sent_at: string;
  devices_ok: number;
}

export async function listMyNotifications(userId: string, limit = 10): Promise<NotificationLogEntry[]> {
  return check(
    await db()
      .from('notification_log')
      .select('id, kind, title, body, sent_at, devices_ok')
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .limit(limit),
  ) as NotificationLogEntry[];
}
