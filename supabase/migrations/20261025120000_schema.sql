-- =============================================================================
-- REFRUN · 001 · Esquema base
-- -----------------------------------------------------------------------------
-- Fuente de verdad:
--   * Objetivos semanales  = suma de matches.target_km por (árbitro, semana).
--   * Kilómetros completados = suma de workouts.distance_km confirmados, por
--     (usuario, semana ISO de activity_date), filtrando los tipos de actividad
--     que la temporada declara computables.
-- No se almacenan totales derivados que puedan divergir: los agregados se
-- calculan siempre a partir de estas dos tablas (ver src/domain/calc).
--
-- Política de borrado y conservación:
--   * Los registros deportivos (matches, workouts) usan ON DELETE RESTRICT
--     respecto a perfiles, grupos y temporadas: no se pierden en cascada.
--   * Los miembros no se borran: se marcan como 'inactive'.
--   * Toda alta, modificación o baja en tablas sensibles queda registrada en
--     audit_events con la instantánea anterior y posterior.
-- =============================================================================

create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'member');
create type public.member_status as enum ('active', 'inactive');
create type public.season_status as enum ('planned', 'active', 'closed');
create type public.compliance_policy as enum ('season_total', 'weekly_independent', 'carry_forward');
create type public.workout_source as enum ('strava', 'apple', 'gym_console', 'other_app', 'manual');
create type public.activity_type as enum ('run', 'treadmill', 'walk', 'bike', 'row', 'elliptical', 'other');
create type public.entry_method as enum ('ocr', 'manual');
create type public.validation_status as enum ('confirmed', 'pending', 'rejected');
create type public.distance_unit as enum ('km', 'm', 'mi');
create type public.calories_kind as enum ('active', 'total', 'unknown');

-- -----------------------------------------------------------------------------
-- Configuración global (fila única, invisible para los clientes)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  allow_group_creation boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

comment on table public.app_settings is
  'Ajustes globales. allow_group_creation=false impide crear grupos nuevos tras la configuración inicial.';

-- -----------------------------------------------------------------------------
-- Perfiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_color text not null default 'lime'
    check (avatar_color in ('lime', 'cyan', 'amber', 'violet', 'rose', 'sky', 'orange', 'teal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Grupos y miembros
-- -----------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  timezone text not null default 'Europe/Madrid',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role public.member_role not null default 'member',
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code_hash text not null unique,
  code_hint text not null,
  role public.member_role not null default 'member' check (role <> 'owner'),
  max_uses integer not null default 1 check (max_uses between 1 and 50),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  note text check (note is null or char_length(note) <= 80),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index invitations_group_idx on public.invitations (group_id, created_at desc);

-- Intentos de canje (limitación de fuerza bruta). Sin acceso desde el cliente.
create table public.invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_idx on public.invite_attempts (user_id, attempted_at desc);

-- -----------------------------------------------------------------------------
-- Temporadas
-- -----------------------------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Europe/Madrid',
  status public.season_status not null default 'planned',
  compliance_policy public.compliance_policy not null default 'season_total',
  counted_activity_types public.activity_type[] not null default '{run,treadmill}'
    check (cardinality(counted_activity_types) >= 1),
  manual_requires_review boolean not null default false,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 400)
);
create index seasons_group_idx on public.seasons (group_id, start_date);
create unique index seasons_one_active_per_group on public.seasons (group_id) where status = 'active';

comment on column public.seasons.compliance_policy is
  'season_total (por defecto): objetivos y km se acumulan durante toda la temporada; % = km corridos / objetivo acumulado. '
  'weekly_independent: cada semana se evalúa por separado (el exceso no compensa otras semanas). '
  'carry_forward: el exceso de una semana compensa déficits de semanas ANTERIORES de la misma temporada.';
comment on column public.seasons.counted_activity_types is
  'Tipos de actividad cuyos kilómetros computan para el objetivo.';

-- -----------------------------------------------------------------------------
-- Partidos (generan los objetivos semanales)
-- -----------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,
  referee_id uuid not null references public.profiles (id) on delete restrict,
  match_date date not null,
  -- Lunes de la semana de cumplimiento (semana ISO lunes-domingo).
  week_start date not null check (extract(isodow from week_start) = 1),
  competition text check (competition is null or char_length(competition) <= 60),
  home_team text check (home_team is null or char_length(home_team) <= 60),
  away_team text check (away_team is null or char_length(away_team) <= 60),
  home_goals smallint not null check (home_goals between 0 and 99),
  away_goals smallint not null check (away_goals between 0 and 99),
  target_km smallint generated always as (home_goals + away_goals) stored,
  notes text check (notes is null or char_length(notes) <= 500),
  change_reason text check (change_reason is null or char_length(change_reason) <= 300),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un árbitro no puede tener dos partidos asignados a la misma semana de una temporada.
  constraint matches_one_per_referee_week unique (season_id, referee_id, week_start)
);
create index matches_group_season_week_idx on public.matches (group_id, season_id, week_start);
create index matches_referee_idx on public.matches (referee_id, week_start);

-- -----------------------------------------------------------------------------
-- Entrenamientos
-- -----------------------------------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  activity_date date not null,
  activity_time time,
  -- Lunes de la semana ISO de activity_date (lo calcula un trigger).
  week_start date not null,
  activity_type public.activity_type not null default 'run',
  source public.workout_source not null,
  entry_method public.entry_method not null,
  distance_value numeric(9, 3) not null check (distance_value > 0),
  distance_unit public.distance_unit not null,
  distance_km numeric(7, 3) not null check (distance_km > 0 and distance_km <= 300),
  duration_s integer check (duration_s is null or duration_s between 1 and 172800),
  avg_pace_s_per_km numeric(7, 1) check (avg_pace_s_per_km is null or avg_pace_s_per_km between 60 and 3600),
  avg_speed_kmh numeric(5, 2) check (avg_speed_kmh is null or avg_speed_kmh between 0.5 and 80),
  calories integer check (calories is null or calories between 0 and 20000),
  calories_kind public.calories_kind,
  validation_status public.validation_status not null default 'confirmed',
  review_note text check (review_note is null or char_length(review_note) <= 300),
  -- Huella de los datos normalizados para AVISAR de posibles duplicados (no bloquea).
  fingerprint text not null check (char_length(fingerprint) between 8 and 128),
  -- Clave de idempotencia: evita dobles envíos del mismo formulario.
  client_request_id uuid not null,
  -- Metadatos opcionales (p. ej. vatios, campos editados tras el OCR). Nunca imágenes.
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workouts_idempotency unique (user_id, client_request_id),
  constraint workouts_distance_normalized check (
    abs(distance_km - case distance_unit
      when 'km' then distance_value
      when 'm' then distance_value / 1000
      when 'mi' then distance_value * 1.609344
    end) < 0.01
  )
);
create index workouts_group_date_idx on public.workouts (group_id, activity_date desc);
create index workouts_user_date_idx on public.workouts (user_id, activity_date desc);
create index workouts_fingerprint_idx on public.workouts (group_id, fingerprint);

-- -----------------------------------------------------------------------------
-- Auditoría (solo la escriben los triggers)
-- -----------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  group_id uuid,
  actor_id uuid,
  entity_type text not null,
  entity_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_group_idx on public.audit_events (group_id, created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);
