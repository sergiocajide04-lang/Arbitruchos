-- =============================================================================
-- REFRUN · 002 · Funciones auxiliares, triggers de integridad y auditoría
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers de permisos (SECURITY DEFINER para evitar recursión de RLS).
-- Viven en el esquema "private", que no se expone por la API de datos.
-- -----------------------------------------------------------------------------
create or replace function private.is_member(p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function private.is_admin(p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'admin')
  );
$$;

create or replace function private.is_owner(p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = auth.uid()
      and m.status = 'active' and m.role = 'owner'
  );
$$;

-- ¿Comparte el usuario actual algún grupo (en el que él esté activo) con p_user?
create or replace function private.shares_group(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = p_user
  );
$$;

create or replace function private.assert_timezone(p_tz text)
returns void
language plpgsql stable set search_path = ''
as $$
begin
  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception 'Zona horaria no válida: %', p_tz using errcode = 'check_violation';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alta automática de perfil al registrarse
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if v_name = '' then
    v_name := split_part(coalesce(new.email, 'Árbitro'), '@', 1);
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 40))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- updated_at genérico
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Grupos
-- -----------------------------------------------------------------------------
create or replace function private.groups_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_timezone(new.timezone);
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger groups_before_write before insert or update on public.groups
  for each row execute function private.groups_before_write();

-- -----------------------------------------------------------------------------
-- Miembros: protege al propietario y la gestión de administradores
-- -----------------------------------------------------------------------------
create or replace function private.group_members_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.group_id := old.group_id;
  new.user_id := old.user_id;
  new.joined_at := old.joined_at;
  new.updated_at := now();

  if auth.uid() is null then
    return new; -- operación administrativa (SQL editor / service role)
  end if;

  -- Reactivación mediante invitación válida (solo alcanzable desde accept_invitation,
  -- porque un miembro inactivo no supera la RLS de UPDATE).
  if old.status = 'inactive' and new.status = 'active' and old.user_id = auth.uid()
     and new.role <> 'owner' then
    return new;
  end if;

  if old.role = 'owner' and (new.role <> old.role or new.status <> old.status) then
    raise exception 'El propietario del grupo no puede ser modificado ni desactivado'
      using errcode = 'insufficient_privilege';
  end if;
  if new.role = 'owner' and old.role <> 'owner' then
    raise exception 'No se puede asignar el rol de propietario' using errcode = 'insufficient_privilege';
  end if;
  if (old.role = 'admin' or new.role = 'admin') and not private.is_owner(old.group_id) then
    raise exception 'Solo el propietario puede gestionar administradores'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger group_members_before_update before update on public.group_members
  for each row execute function private.group_members_before_update();

-- -----------------------------------------------------------------------------
-- Temporadas
-- -----------------------------------------------------------------------------
create or replace function private.seasons_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_timezone(new.timezone);

  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.group_id := old.group_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  elsif auth.uid() is not null then
    new.created_by := auth.uid();
  end if;

  if exists (
    select 1 from public.seasons s
    where s.group_id = new.group_id and s.id <> new.id
      and daterange(s.start_date, s.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'Las fechas se solapan con otra temporada del grupo' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1 from public.matches m
    where m.season_id = new.id
      and (m.week_start < date_trunc('week', new.start_date)::date or m.week_start > new.end_date)
  ) then
    raise exception 'Hay partidos asignados a semanas que quedarían fuera de la temporada'
      using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger seasons_before_write before insert or update on public.seasons
  for each row execute function private.seasons_before_write();

-- -----------------------------------------------------------------------------
-- Partidos
-- -----------------------------------------------------------------------------
create or replace function private.matches_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_season public.seasons%rowtype;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.group_id := old.group_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.season_id is distinct from old.season_id then
      raise exception 'Un partido no puede moverse a otra temporada' using errcode = 'check_violation';
    end if;
    if (new.home_goals, new.away_goals, new.referee_id, new.week_start, new.match_date)
       is distinct from (old.home_goals, old.away_goals, old.referee_id, old.week_start, old.match_date)
       and coalesce(btrim(new.change_reason), '') = '' then
      raise exception 'Indica el motivo de la corrección' using errcode = 'check_violation';
    end if;
  else
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.change_reason := null;
  end if;

  select * into v_season from public.seasons s where s.id = new.season_id;
  if not found or v_season.group_id <> new.group_id then
    raise exception 'La temporada no pertenece al grupo' using errcode = 'check_violation';
  end if;
  if v_season.status = 'closed' then
    raise exception 'La temporada está cerrada' using errcode = 'check_violation';
  end if;
  if new.week_start < date_trunc('week', v_season.start_date)::date or new.week_start > v_season.end_date then
    raise exception 'La semana de cumplimiento está fuera de la temporada' using errcode = 'check_violation';
  end if;
  if new.match_date > current_date + 1 then
    raise exception 'La fecha del partido no puede estar en el futuro' using errcode = 'check_violation';
  end if;
  if (tg_op = 'INSERT' or new.referee_id is distinct from old.referee_id) and not exists (
    select 1 from public.group_members m
    where m.group_id = new.group_id and m.user_id = new.referee_id and m.status = 'active'
  ) then
    raise exception 'El árbitro no es miembro activo del grupo' using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger matches_before_write before insert or update on public.matches
  for each row execute function private.matches_before_write();

create or replace function private.matches_before_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.seasons s where s.id = old.season_id and s.status = 'closed') then
    raise exception 'La temporada está cerrada' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger matches_before_delete before delete on public.matches
  for each row execute function private.matches_before_delete();

-- -----------------------------------------------------------------------------
-- Entrenamientos
-- -----------------------------------------------------------------------------
create or replace function private.workout_in_closed_season(p_group uuid, p_date date)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.seasons s
    where s.group_id = p_group and s.status = 'closed' and p_date between s.start_date and s.end_date
  );
$$;

create or replace function private.workouts_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_review boolean;
  v_data_changed boolean;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.user_id := old.user_id;
    new.group_id := old.group_id;
    new.client_request_id := old.client_request_id;
    new.created_at := old.created_at;
    if private.workout_in_closed_season(old.group_id, old.activity_date) then
      raise exception 'La temporada de ese entrenamiento está cerrada' using errcode = 'check_violation';
    end if;
  end if;

  new.week_start := date_trunc('week', new.activity_date)::date;

  if new.activity_date > current_date + 1 then
    raise exception 'La fecha del entrenamiento no puede estar en el futuro' using errcode = 'check_violation';
  end if;
  if private.workout_in_closed_season(new.group_id, new.activity_date) then
    raise exception 'La temporada de esa fecha está cerrada' using errcode = 'check_violation';
  end if;

  new.updated_at := now();

  if v_uid is null then
    return new; -- operación administrativa
  end if;

  v_is_admin := private.is_admin(new.group_id);

  if tg_op = 'INSERT' then
    select s.manual_requires_review into v_review
    from public.seasons s
    where s.group_id = new.group_id and new.activity_date between s.start_date and s.end_date
    limit 1;

    -- El estado lo decide el servidor: nadie se auto-valida un registro manual.
    if new.entry_method = 'manual' and coalesce(v_review, false) and not v_is_admin then
      new.validation_status := 'pending';
    else
      new.validation_status := 'confirmed';
    end if;
    new.review_note := null;
    return new;
  end if;

  v_data_changed :=
    (new.activity_date, new.activity_time, new.activity_type, new.source, new.entry_method,
     new.distance_value, new.distance_unit, new.distance_km, new.duration_s,
     new.avg_pace_s_per_km, new.avg_speed_kmh, new.calories, new.calories_kind,
     new.fingerprint, new.details)
    is distinct from
    (old.activity_date, old.activity_time, old.activity_type, old.source, old.entry_method,
     old.distance_value, old.distance_unit, old.distance_km, old.duration_s,
     old.avg_pace_s_per_km, old.avg_speed_kmh, old.calories, old.calories_kind,
     old.fingerprint, old.details);

  if old.user_id <> v_uid then
    -- Un administrador solo puede moderar (estado y nota) entrenamientos ajenos.
    if v_data_changed then
      raise exception 'Solo puedes cambiar el estado de validación de entrenamientos ajenos'
        using errcode = 'insufficient_privilege';
    end if;
  elsif not v_is_admin then
    new.review_note := old.review_note;
    if old.validation_status = 'rejected' and v_data_changed then
      new.validation_status := 'pending';
    else
      new.validation_status := old.validation_status;
    end if;
  end if;

  return new;
end;
$$;

create trigger workouts_before_write before insert or update on public.workouts
  for each row execute function private.workouts_before_write();

create or replace function private.workouts_before_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.workout_in_closed_season(old.group_id, old.activity_date) then
    raise exception 'La temporada de ese entrenamiento está cerrada' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger workouts_before_delete before delete on public.workouts
  for each row execute function private.workouts_before_delete();

-- -----------------------------------------------------------------------------
-- Auditoría genérica
-- -----------------------------------------------------------------------------
create or replace function private.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_group uuid;
  v_entity text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old) - 'code_hash';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new) - 'code_hash';
  end if;
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;

  v_row := coalesce(v_new, v_old);
  if tg_table_name = 'groups' then
    v_group := (v_row ->> 'id')::uuid;
  else
    v_group := (v_row ->> 'group_id')::uuid;
  end if;
  v_entity := coalesce(v_row ->> 'id', (v_row ->> 'group_id') || ':' || (v_row ->> 'user_id'));

  insert into public.audit_events (group_id, actor_id, entity_type, entity_id, action, reason, before, after)
  values (
    v_group,
    auth.uid(),
    tg_table_name,
    v_entity,
    lower(tg_op),
    case when tg_op = 'UPDATE' then v_new ->> 'change_reason' end,
    v_old,
    v_new
  );
  return null;
end;
$$;

create trigger audit_groups after insert or update or delete on public.groups
  for each row execute function private.audit_row();
create trigger audit_group_members after insert or update or delete on public.group_members
  for each row execute function private.audit_row();
create trigger audit_invitations after insert or update or delete on public.invitations
  for each row execute function private.audit_row();
create trigger audit_seasons after insert or update or delete on public.seasons
  for each row execute function private.audit_row();
create trigger audit_matches after insert or update or delete on public.matches
  for each row execute function private.audit_row();
create trigger audit_workouts after insert or update or delete on public.workouts
  for each row execute function private.audit_row();

-- -----------------------------------------------------------------------------
-- RPC: crear grupo (el creador pasa a ser propietario)
-- -----------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_timezone text default 'Europe/Madrid')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión' using errcode = 'insufficient_privilege';
  end if;
  if not (select allow_group_creation from public.app_settings where id) then
    raise exception 'La creación de grupos está deshabilitada en esta instalación'
      using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.group_members where user_id = v_uid and role = 'owner') >= 3 then
    raise exception 'Has alcanzado el máximo de grupos propios' using errcode = 'check_violation';
  end if;

  insert into public.groups (name, timezone, created_by)
  values (btrim(p_name), p_timezone, v_uid)
  returning id into v_group;

  insert into public.group_members (group_id, user_id, role) values (v_group, v_uid, 'owner');
  return v_group;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: crear invitación. Devuelve el código en claro UNA sola vez; solo se
-- almacena su hash SHA-256.
-- -----------------------------------------------------------------------------
create or replace function private.normalize_invite_code(p_code text)
returns text
language sql immutable set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.create_invitation(
  p_group_id uuid,
  p_role public.member_role default 'member',
  p_max_uses integer default 1,
  p_valid_days integer default 7,
  p_note text default null
)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_raw text := '';
  v_id uuid;
  v_expires timestamptz;
  i integer;
begin
  if not private.is_admin(p_group_id) then
    raise exception 'Solo un administrador puede invitar' using errcode = 'insufficient_privilege';
  end if;
  if p_role = 'owner' then
    raise exception 'No se puede invitar como propietario' using errcode = 'check_violation';
  end if;
  if p_role = 'admin' and not private.is_owner(p_group_id) then
    raise exception 'Solo el propietario puede invitar administradores' using errcode = 'insufficient_privilege';
  end if;
  if p_valid_days not between 1 and 30 then
    raise exception 'La validez debe estar entre 1 y 30 días' using errcode = 'check_violation';
  end if;

  -- 10 caracteres de un alfabeto de 32 símbolos (50 bits) a partir de gen_random_uuid().
  v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  for i in 0..9 loop
    v_raw := v_raw || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  v_expires := now() + make_interval(days => p_valid_days);

  insert into public.invitations (group_id, code_hash, code_hint, role, max_uses, expires_at, note, created_by)
  values (
    p_group_id,
    encode(sha256(convert_to(v_raw, 'UTF8')), 'hex'),
    right(v_raw, 2),
    p_role,
    p_max_uses,
    v_expires,
    nullif(btrim(p_note), ''),
    auth.uid()
  )
  returning invitations.id into v_id;

  return query select v_id, substr(v_raw, 1, 5) || '-' || substr(v_raw, 6, 5), v_expires;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: canjear invitación
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
  v_member public.group_members%rowtype;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión' using errcode = 'insufficient_privilege';
  end if;

  if (select count(*) from public.invite_attempts a
      where a.user_id = v_uid and not a.succeeded and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'Demasiados intentos. Vuelve a probar dentro de una hora.' using errcode = 'P0001';
  end if;

  select * into v_inv
  from public.invitations i
  where i.code_hash = encode(sha256(convert_to(private.normalize_invite_code(p_code), 'UTF8')), 'hex')
    and i.revoked_at is null
    and i.expires_at > now()
    and i.use_count < i.max_uses
  for update;

  if not found then
    insert into public.invite_attempts (user_id, succeeded) values (v_uid, false);
    raise exception 'Código de invitación no válido o caducado' using errcode = 'P0001';
  end if;

  select * into v_member from public.group_members m where m.group_id = v_inv.group_id and m.user_id = v_uid;
  if found and v_member.status = 'active' then
    return v_inv.group_id; -- ya es miembro: no consume la invitación
  end if;

  if found then
    update public.group_members
      set status = 'active', role = v_inv.role
      where group_id = v_inv.group_id and user_id = v_uid;
  else
    insert into public.group_members (group_id, user_id, role) values (v_inv.group_id, v_uid, v_inv.role);
  end if;

  update public.invitations set use_count = use_count + 1 where invitations.id = v_inv.id;
  insert into public.invite_attempts (user_id, succeeded) values (v_uid, true);
  return v_inv.group_id;
end;
$$;
