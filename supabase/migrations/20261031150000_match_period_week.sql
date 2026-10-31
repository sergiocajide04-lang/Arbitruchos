-- =============================================================================
-- REFRUN · 006 · Un partido por árbitro y PERIODO (sábado 09:00 → sábado 08:59)
-- -----------------------------------------------------------------------------
-- Desde la 004 los objetivos se calculan por periodos de sábado a sábado a partir
-- de matches.match_date. matches.week_start solo sirve ya como clave para impedir
-- dos partidos del mismo árbitro en un mismo fin de semana, y debe ser el lunes
-- del periodo del partido (sábado o domingo → el lunes siguiente; viernes → el
-- lunes de 3 días después). Los partidos antiguos se guardaron con la regla
-- «semana siguiente / semana del partido» y su clave puede coincidir con la del
-- fin de semana siguiente, bloqueando partidos nuevos.
--
-- Esta migración:
--   1. Recalcula week_start de los partidos existentes (no cambia goles,
--      tarjetas, fechas ni objetivos; no genera entradas de auditoría).
--   2. Sustituye la restricción única por una comprobación en el trigger, que
--      respeta posibles duplicados históricos pero impide crear otros nuevos.
-- =============================================================================

create or replace function private.match_week_start(p_match_date date)
returns date
language sql immutable set search_path = ''
as $$
  -- Sábado de inicio del periodo + 2 días = lunes dentro del periodo.
  select case
    when extract(isodow from p_match_date) = 5 then p_match_date + 3
    else p_match_date - ((extract(isodow from p_match_date)::int + 1) % 7) + 2
  end;
$$;

alter table public.matches drop constraint matches_one_per_referee_week;

-- Recalcular sin pasar por los triggers (exigirían motivo de corrección).
alter table public.matches disable trigger user;
update public.matches
set week_start = private.match_week_start(match_date)
where week_start is distinct from private.match_week_start(match_date);
alter table public.matches enable trigger user;

create index if not exists matches_referee_period_idx on public.matches (season_id, referee_id, week_start);

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
        new.referee_id, new.match_date)
       is distinct from (old.home_goals, old.away_goals, old.yellow_cards, old.blue_cards, old.red_cards,
        old.referee_id, old.match_date)
       and coalesce(btrim(new.change_reason), '') = '' then
      raise exception 'Indica el motivo de la corrección' using errcode = 'check_violation';
    end if;
  else
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.change_reason := null;
  end if;

  -- La clave de periodo siempre la calcula el servidor a partir de la fecha.
  new.week_start := private.match_week_start(new.match_date);

  select * into v_season from public.seasons s where s.id = new.season_id;
  if not found or v_season.group_id <> new.group_id then
    raise exception 'La temporada no pertenece al grupo' using errcode = 'check_violation';
  end if;
  if v_season.status = 'closed' then
    raise exception 'La temporada está cerrada' using errcode = 'check_violation';
  end if;
  if new.match_date < v_season.start_date - 7 or new.match_date > v_season.end_date then
    raise exception 'La fecha del partido está fuera de la temporada' using errcode = 'check_violation';
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
  -- Un partido por árbitro y fin de semana (periodo de sábado a sábado).
  if (tg_op = 'INSERT' or (new.referee_id, new.week_start) is distinct from (old.referee_id, old.week_start))
     and exists (
       select 1 from public.matches m
       where m.season_id = new.season_id and m.referee_id = new.referee_id
         and m.week_start = new.week_start and m.id <> new.id
     ) then
    raise exception 'Este árbitro ya tiene un partido registrado en ese fin de semana' using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
