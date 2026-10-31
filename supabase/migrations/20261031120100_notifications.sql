-- =============================================================================
-- REFRUN · 005 · Notificaciones push (Web Push + VAPID)
-- -----------------------------------------------------------------------------
-- * notification_settings: preferencias de cada usuario (solo las ve y cambia él).
-- * push_subscriptions:    un registro por dispositivo. El alta pasa por una RPC
--                          que reasigna el endpoint si el navegador cambia de cuenta.
-- * notification_log:      registro de envíos. La clave única (usuario, tipo,
--                          periodo) impide enviar dos veces el mismo recordatorio.
-- * groups.match_reminder_*: días y hora del recordatorio de partido del grupo.
-- El envío lo hace scripts/notify (GitHub Actions, cada hora) con la clave
-- secreta de Supabase y la clave privada VAPID, que nunca llegan al navegador.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ajustes del grupo: recordatorio de registrar el partido
--   Días ISO (1 = lunes … 7 = domingo). Por defecto domingo y lunes a las 20:00.
-- -----------------------------------------------------------------------------
alter table public.groups
  add column match_reminder_days smallint[] not null default '{7,1}'
    check (cardinality(match_reminder_days) between 1 and 2
           and match_reminder_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add column match_reminder_hour smallint not null default 20
    check (match_reminder_hour between 8 and 22);

grant update (match_reminder_days, match_reminder_hour) on public.groups to authenticated;

-- -----------------------------------------------------------------------------
-- Preferencias por usuario
-- -----------------------------------------------------------------------------
create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default true,
  match_reminders boolean not null default true,
  km_reminders boolean not null default true,
  -- Dos días distintos de recordatorio de km (por defecto martes y viernes).
  km_days smallint[] not null default '{2,5}'
    check (cardinality(km_days) = 2 and km_days[1] <> km_days[2]
           and km_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  -- Hora local (zona horaria de la temporada); nunca de noche.
  remind_hour smallint not null default 19 check (remind_hour between 8 and 22),
  updated_at timestamptz not null default now()
);

create trigger notification_settings_touch before update on public.notification_settings
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Suscripciones push (una por dispositivo/navegador)
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1024),
  p256dh text not null check (char_length(p256dh) between 16 and 256),
  auth text not null check (char_length(auth) between 8 and 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  failure_count integer not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- -----------------------------------------------------------------------------
-- Registro de envíos (también evita duplicados)
-- -----------------------------------------------------------------------------
create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  kind text not null check (kind in ('match_reminder', 'km_reminder', 'km_done', 'test')),
  period_key text not null check (char_length(period_key) <= 80),
  title text not null,
  body text not null,
  pending_km numeric(8, 3),
  devices_ok integer not null default 0,
  devices_failed integer not null default 0,
  sent_at timestamptz not null default now(),
  constraint notification_log_once unique (user_id, kind, period_key)
);
create index notification_log_user_idx on public.notification_log (user_id, sent_at desc);

-- -----------------------------------------------------------------------------
-- RPC: registrar / reasignar el dispositivo actual
-- -----------------------------------------------------------------------------
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para activar las notificaciones' using errcode = 'insufficient_privilege';
  end if;
  -- El endpoint lo genera el navegador: si otra cuenta lo usaba en este mismo
  -- dispositivo, pasa a la cuenta actual (la anterior dejaría de recibir avisos aquí).
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  returning id into v_id;
  -- Como mucho 10 dispositivos por usuario: se descartan los más antiguos.
  delete from public.push_subscriptions
  where user_id = v_uid
    and id not in (
      select id from public.push_subscriptions where user_id = v_uid order by created_at desc limit 10
    );
  insert into public.notification_settings (user_id) values (v_uid) on conflict (user_id) do nothing;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilegios y RLS
-- -----------------------------------------------------------------------------
revoke all on public.notification_settings, public.push_subscriptions, public.notification_log from anon, authenticated;
revoke all on function public.register_push_subscription(text, text, text, text) from anon, authenticated, public;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

grant select on public.notification_settings to authenticated;
grant insert (user_id, enabled, match_reminders, km_reminders, km_days, remind_hour) on public.notification_settings to authenticated;
grant update (enabled, match_reminders, km_reminders, km_days, remind_hour) on public.notification_settings to authenticated;

-- Las claves del dispositivo (p256dh, auth) no se devuelven al cliente.
grant select (id, user_id, endpoint, user_agent, created_at, last_success_at, last_error, failure_count)
  on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

grant select on public.notification_log to authenticated;

alter table public.notification_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

create policy notification_settings_select_own on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_settings_insert_own on public.notification_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notification_settings_update_own on public.notification_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy notification_log_select_own on public.notification_log for select to authenticated
  using (user_id = (select auth.uid()));
