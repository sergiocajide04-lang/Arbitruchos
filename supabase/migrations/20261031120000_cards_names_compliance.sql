-- =============================================================================
-- REFRUN · 004 · Tarjetas en los partidos, nombres de 20 caracteres y
--                metodología definitiva de cumplimiento
-- -----------------------------------------------------------------------------
-- No borra ni modifica partidos, entrenamientos ni perfiles existentes:
--   * Partidos anteriores: 0 tarjetas (no hay información histórica) y su
--     objetivo no cambia (goles + 0).
--   * Nombres de más de 20 caracteres: se conservan. La restricción se crea
--     NOT VALID, así que solo se exige al crear o modificar un perfil. Consulta
--     para localizarlos (SQL Editor):
--       select id, display_name from public.profiles
--       where char_length(btrim(display_name)) > 20;
--   * Los km y el cumplimiento no se guardan en la base de datos: se calculan
--     siempre desde partidos y entrenamientos, así que no hay saldos antiguos
--     que borrar. Al cambiar la metodología, todo se recalcula con la nueva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tarjetas y nueva fórmula del objetivo
--    objetivo = goles A + goles B + amarillas×1 + azules×2 + rojas×5
-- -----------------------------------------------------------------------------
alter table public.matches
  add column yellow_cards smallint not null default 0 check (yellow_cards between 0 and 50),
  add column blue_cards smallint not null default 0 check (blue_cards between 0 and 50),
  add column red_cards smallint not null default 0 check (red_cards between 0 and 50);

-- Una columna generada no puede cambiar de expresión: se recrea con la fórmula
-- nueva. Para los partidos existentes (0 tarjetas) el valor es idéntico.
alter table public.matches drop column target_km;
alter table public.matches
  add column target_km smallint generated always as (
    home_goals + away_goals + yellow_cards + 2 * blue_cards + 5 * red_cards
  ) stored;

comment on column public.matches.target_km is
  'Objetivo en km: goles de ambos equipos + amarillas×1 + azules×2 + rojas×5.';

-- Las correcciones de tarjetas también exigen motivo (igual que las de goles).
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
    if (new.home_goals, new.away_goals, new.yellow_cards, new.blue_cards, new.red_cards,
        new.referee_id, new.week_start, new.match_date)
       is distinct from (old.home_goals, old.away_goals, old.yellow_cards, old.blue_cards, old.red_cards,
        old.referee_id, old.week_start, old.match_date)
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

grant insert (yellow_cards, blue_cards, red_cards) on public.matches to authenticated;
grant update (yellow_cards, blue_cards, red_cards) on public.matches to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Nombre visible: máximo 20 caracteres
-- -----------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_display_name_max_20
  check (char_length(btrim(display_name)) <= 20) not valid;

-- Alta de perfil: si el nombre elegido supera el límite, el registro falla con
-- un error claro en lugar de recortarlo. Solo el nombre de reserva (derivado del
-- correo cuando no se indica ninguno) se acorta, porque no lo ha escrito nadie.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if v_name = '' then
    v_name := left(split_part(coalesce(new.email, 'Árbitro'), '@', 1), 20);
  elsif char_length(v_name) > 20 then
    raise exception 'El nombre no puede superar 20 caracteres' using errcode = 'check_violation';
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Metodología definitiva: compensación de deudas sin saldo a favor
--    Los km de más pagan deudas de semanas anteriores, nunca semanas futuras.
--    El cálculo vive en src/domain/calc/compliance.ts (no hay saldos guardados).
-- -----------------------------------------------------------------------------
update public.seasons set compliance_policy = 'carry_forward' where compliance_policy <> 'carry_forward';
alter table public.seasons alter column compliance_policy set default 'carry_forward';
alter table public.seasons
  add constraint seasons_compliance_policy_definitive check (compliance_policy = 'carry_forward');

comment on column public.seasons.compliance_policy is
  'Siempre carry_forward: los km de más compensan deudas anteriores y nunca generan saldo para semanas futuras.';
