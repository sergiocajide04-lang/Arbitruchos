/**
 * Tipos de dominio, reflejo de supabase/migrations. Si cambias el esquema,
 * actualiza también este archivo.
 */
import type { IsoDate } from '@/lib/dates';

export type MemberRole = 'owner' | 'admin' | 'member';
export type MemberStatus = 'active' | 'inactive';
export type SeasonStatus = 'planned' | 'active' | 'closed';
export type CompliancePolicy = 'season_total' | 'weekly_independent' | 'carry_forward';
export type WorkoutSource = 'strava' | 'apple' | 'gym_console' | 'other_app' | 'manual';
export type ActivityType = 'run' | 'treadmill' | 'walk' | 'bike' | 'row' | 'elliptical' | 'other';
export type EntryMethod = 'ocr' | 'manual';
export type ValidationStatus = 'confirmed' | 'pending' | 'rejected';
export type DistanceUnit = 'km' | 'm' | 'mi';
export type CaloriesKind = 'active' | 'total' | 'unknown';
export type AvatarColor = 'lime' | 'cyan' | 'amber' | 'violet' | 'rose' | 'sky' | 'orange' | 'teal';

export interface Profile {
  id: string;
  display_name: string;
  avatar_color: AvatarColor;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  timezone: string;
  created_by: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  joined_at: string;
}

export interface MemberWithProfile extends GroupMember {
  profile: Profile;
}

export interface Invitation {
  id: string;
  group_id: string;
  code_hint: string;
  role: MemberRole;
  max_uses: number;
  use_count: number;
  expires_at: string;
  revoked_at: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface Season {
  id: string;
  group_id: string;
  name: string;
  start_date: IsoDate;
  end_date: IsoDate;
  timezone: string;
  status: SeasonStatus;
  compliance_policy: CompliancePolicy;
  counted_activity_types: ActivityType[];
  manual_requires_review: boolean;
  created_by: string;
  created_at: string;
}

export interface Match {
  id: string;
  group_id: string;
  season_id: string;
  referee_id: string;
  match_date: IsoDate;
  week_start: IsoDate;
  competition: string | null;
  home_team: string | null;
  away_team: string | null;
  home_goals: number;
  away_goals: number;
  target_km: number;
  notes: string | null;
  change_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkoutDetails {
  watts?: number;
  /** El ritmo guardado se calculó a partir de distancia y duración. */
  pace_derived?: boolean;
  /** Calorías totales cuando las principales son las activas (Apple). */
  calories_total?: number;
  ocr?: {
    engine: string;
    detected_source?: WorkoutSource | null;
    edited_fields?: string[];
    mean_confidence?: number;
  };
  [key: string]: unknown;
}

export interface Workout {
  id: string;
  group_id: string;
  user_id: string;
  activity_date: IsoDate;
  activity_time: string | null;
  week_start: IsoDate;
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
  validation_status: ValidationStatus;
  review_note: string | null;
  fingerprint: string;
  client_request_id: string;
  details: WorkoutDetails;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: number;
  group_id: string | null;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: 'insert' | 'update' | 'delete';
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export const SOURCE_LABELS: Record<WorkoutSource, string> = {
  strava: 'Strava',
  apple: 'Apple Fitness',
  gym_console: 'Máquina de gimnasio',
  other_app: 'Otra app deportiva',
  manual: 'Registro manual',
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  run: 'Carrera',
  treadmill: 'Cinta',
  walk: 'Caminata',
  bike: 'Bicicleta',
  row: 'Remo',
  elliptical: 'Elíptica',
  other: 'Otra',
};

export const VALIDATION_LABELS: Record<ValidationStatus, string> = {
  confirmed: 'Confirmado',
  pending: 'Pendiente de revisión',
  rejected: 'Rechazado',
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
};

export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
  planned: 'Planificada',
  active: 'Activa',
  closed: 'Cerrada',
};

export const POLICY_LABELS: Record<CompliancePolicy, string> = {
  season_total: 'Acumulado de temporada',
  weekly_independent: 'Semanas independientes (alternativa)',
  carry_forward: 'Compensación de semanas anteriores (alternativa)',
};
