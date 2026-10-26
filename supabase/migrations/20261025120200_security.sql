-- =============================================================================
-- REFRUN · 003 · Seguridad: privilegios, Row Level Security y Realtime
-- -----------------------------------------------------------------------------
-- Principios:
--   * El rol "anon" no tiene acceso a ningún dato.
--   * "authenticated" solo ve datos de los grupos en los que es miembro activo.
--   * Las columnas modificables se limitan con GRANT por columna.
--   * Los triggers de 002 completan las reglas que RLS no puede expresar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privilegios
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
revoke all on all functions in schema private from anon, authenticated, public;
revoke all on schema private from anon, public;
grant usage on schema private to authenticated;

grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;
grant execute on function private.shares_group(uuid) to authenticated;

grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.create_invitation(uuid, public.member_role, integer, integer, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- profiles: lectura + edición de campos propios autorizados
grant select on public.profiles to authenticated;
grant update (display_name, avatar_color) on public.profiles to authenticated;

-- groups: lectura + edición de nombre/zona horaria (admins, vía RLS)
grant select on public.groups to authenticated;
grant update (name, timezone) on public.groups to authenticated;

-- group_members: lectura + cambio de rol/estado (admins, vía RLS + trigger)
grant select on public.group_members to authenticated;
grant update (role, status) on public.group_members to authenticated;

-- invitations: solo admins; el alta se hace vía RPC, aquí solo se revoca
grant select (id, group_id, code_hint, role, max_uses, use_count, expires_at, revoked_at, note, created_by, created_at)
  on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;

-- seasons
grant select, delete on public.seasons to authenticated;
grant insert (group_id, name, start_date, end_date, timezone, status, compliance_policy,
              counted_activity_types, manual_requires_review)
  on public.seasons to authenticated;
grant update (name, start_date, end_date, timezone, status, compliance_policy,
              counted_activity_types, manual_requires_review)
  on public.seasons to authenticated;

-- matches
grant select, delete on public.matches to authenticated;
grant insert (group_id, season_id, referee_id, match_date, week_start, competition,
              home_team, away_team, home_goals, away_goals, notes)
  on public.matches to authenticated;
grant update (referee_id, match_date, week_start, competition, home_team, away_team,
              home_goals, away_goals, notes, change_reason)
  on public.matches to authenticated;

-- workouts
grant select, delete on public.workouts to authenticated;
grant insert (group_id, activity_date, activity_time, activity_type, source, entry_method,
              distance_value, distance_unit, distance_km, duration_s, avg_pace_s_per_km,
              avg_speed_kmh, calories, calories_kind, fingerprint, client_request_id, details)
  on public.workouts to authenticated;
grant update (activity_date, activity_time, activity_type, source, entry_method,
              distance_value, distance_unit, distance_km, duration_s, avg_pace_s_per_km,
              avg_speed_kmh, calories, calories_kind, fingerprint, details,
              validation_status, review_note)
  on public.workouts to authenticated;

-- audit_events: solo lectura
grant select on public.audit_events to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security en TODAS las tablas del esquema público
-- -----------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invitations enable row level security;
alter table public.invite_attempts enable row level security;
alter table public.seasons enable row level security;
alter table public.matches enable row level security;
alter table public.workouts enable row level security;
alter table public.audit_events enable row level security;

-- app_settings, invite_attempts: sin políticas => inaccesibles desde el cliente.

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_group(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- groups
create policy groups_select on public.groups for select to authenticated
  using (private.is_member(id));
create policy groups_update_admin on public.groups for update to authenticated
  using (private.is_admin(id))
  with check (private.is_admin(id));

-- group_members
create policy group_members_select on public.group_members for select to authenticated
  using (private.is_member(group_id));
create policy group_members_update_admin on public.group_members for update to authenticated
  using (private.is_admin(group_id))
  with check (private.is_admin(group_id));

-- invitations
create policy invitations_select_admin on public.invitations for select to authenticated
  using (private.is_admin(group_id));
create policy invitations_update_admin on public.invitations for update to authenticated
  using (private.is_admin(group_id))
  with check (private.is_admin(group_id));

-- seasons
create policy seasons_select on public.seasons for select to authenticated
  using (private.is_member(group_id));
create policy seasons_insert_admin on public.seasons for insert to authenticated
  with check (private.is_admin(group_id));
create policy seasons_update_admin on public.seasons for update to authenticated
  using (private.is_admin(group_id))
  with check (private.is_admin(group_id));
create policy seasons_delete_admin on public.seasons for delete to authenticated
  using (private.is_admin(group_id) and status = 'planned');

-- matches
create policy matches_select on public.matches for select to authenticated
  using (private.is_member(group_id));
create policy matches_insert on public.matches for insert to authenticated
  with check (
    private.is_member(group_id)
    and (referee_id = (select auth.uid()) or private.is_admin(group_id))
  );
-- Corrección: administradores siempre; el autor solo durante 30 minutos tras crearlo.
create policy matches_update on public.matches for update to authenticated
  using (
    private.is_admin(group_id)
    or (created_by = (select auth.uid()) and created_at > now() - interval '30 minutes'
        and private.is_member(group_id))
  )
  with check (
    private.is_admin(group_id)
    or (referee_id = (select auth.uid()) and private.is_member(group_id))
  );
create policy matches_delete on public.matches for delete to authenticated
  using (
    private.is_admin(group_id)
    or (created_by = (select auth.uid()) and created_at > now() - interval '30 minutes'
        and private.is_member(group_id))
  );

-- workouts
create policy workouts_select on public.workouts for select to authenticated
  using (private.is_member(group_id));
create policy workouts_insert_own on public.workouts for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(group_id));
create policy workouts_update on public.workouts for update to authenticated
  using ((user_id = (select auth.uid()) and private.is_member(group_id)) or private.is_admin(group_id))
  with check ((user_id = (select auth.uid()) and private.is_member(group_id)) or private.is_admin(group_id));
create policy workouts_delete_own on public.workouts for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_member(group_id));

-- audit_events
create policy audit_events_select on public.audit_events for select to authenticated
  using (group_id is not null and private.is_member(group_id));

-- -----------------------------------------------------------------------------
-- Realtime (solo si existe la publicación de Supabase). Realtime respeta RLS.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.matches, public.workouts, public.group_members;
  end if;
end;
$$;
