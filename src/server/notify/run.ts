/* eslint-disable no-console -- script de línea de comandos: informa por consola */
/**
 * Envío programado de notificaciones (se ejecuta cada hora desde GitHub Actions:
 * .github/workflows/notifications.yml). Uso local:
 *
 *   npx tsx --tsconfig tsconfig.app.json src/server/notify/run.ts [--dry-run]
 *
 * Variables (solo en el servidor / secretos de GitHub, NUNCA en el navegador):
 *   SUPABASE_URL          URL del proyecto (la misma que VITE_SUPABASE_URL)
 *   SUPABASE_SECRET_KEY   clave secreta sb_secret_... (o service_role antigua)
 *   VAPID_PUBLIC_KEY      clave pública VAPID (la misma que VITE_VAPID_PUBLIC_KEY)
 *   VAPID_PRIVATE_KEY     clave privada VAPID
 *   VAPID_SUBJECT         contacto, p. ej. mailto:tu@correo.com
 *
 * Cada ejecución lee los datos ACTUALES (partidos, entrenos, preferencias y
 * registro de envíos) justo antes de decidir, así nunca se avisa con saldos viejos.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import {
  planNotifications,
  type PlanGroup,
  type PlanLogEntry,
  type PlanMatch,
  type PlanSeason,
  type PlanSettings,
  type PlanWorkout,
} from '@/domain/notifications/plan';
import { deliver, type DeliveryStore, type PushTarget } from './deliver';

const dryRun = process.argv.includes('--dry-run');

function env(name: string, required = true): string {
  const v = process.env[name]?.trim() ?? '';
  if (!v && required) {
    console.error(`Falta la variable ${name}.`);
    process.exit(1);
  }
  return v;
}

/** Lee todas las filas de una consulta en páginas de 1000 (límite de la API). */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function load(db: SupabaseClient) {
  const seasons = await all<PlanSeason>((a, b) =>
    db.from('seasons').select('id, group_id, start_date, end_date, timezone, status, counted_activity_types').eq('status', 'active').range(a, b),
  );
  const groupIds = [...new Set(seasons.map((s) => s.group_id))];
  if (groupIds.length === 0) return null;
  const seasonIds = seasons.map((s) => s.id);
  const minStart = seasons.reduce((m, s) => (s.start_date < m ? s.start_date : m), seasons[0]!.start_date);

  const [groups, members, matches, workouts, settingsRows, subs] = await Promise.all([
    all<PlanGroup>((a, b) => db.from('groups').select('id, match_reminder_days, match_reminder_hour').in('id', groupIds).range(a, b)),
    all<{ group_id: string; user_id: string; status: string }>((a, b) =>
      db.from('group_members').select('group_id, user_id, status').in('group_id', groupIds).range(a, b),
    ),
    all<PlanMatch>((a, b) => db.from('matches').select('season_id, referee_id, match_date, week_start, target_km').in('season_id', seasonIds).range(a, b)),
    all<PlanWorkout>((a, b) =>
      db
        .from('workouts')
        .select('id, group_id, user_id, activity_date, activity_time, week_start, distance_km, duration_s, activity_type, validation_status')
        .in('group_id', groupIds)
        .gte('activity_date', minStart)
        .range(a, b),
    ),
    all<PlanSettings & { user_id: string }>((a, b) =>
      db.from('notification_settings').select('user_id, enabled, match_reminders, km_reminders, km_days, remind_hour').range(a, b),
    ),
    all<PushTarget>((a, b) => db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, failure_count').range(a, b)),
  ]);
  const userIds = [...new Set(subs.map((s) => s.user_id))];
  const log =
    userIds.length === 0
      ? []
      : await all<PlanLogEntry>((a, b) =>
          db
            .from('notification_log')
            .select('user_id, kind, period_key, sent_at')
            .in('user_id', userIds)
            .gte('sent_at', new Date(Date.now() - 400 * 86_400_000).toISOString())
            .range(a, b),
        );
  return { seasons, groups, members, matches, workouts, settingsRows, subs, log };
}

function storeFor(db: SupabaseClient): DeliveryStore {
  return {
    async claim(n) {
      const { data, error } = await db
        .from('notification_log')
        .upsert(
          { user_id: n.userId, group_id: n.groupId, kind: n.kind, period_key: n.periodKey, title: n.title, body: n.body, pending_km: n.pendingKm },
          { onConflict: 'user_id,kind,period_key', ignoreDuplicates: true },
        )
        .select('id');
      if (error) throw error;
      return data && data.length > 0 ? (data[0] as { id: number }).id : null;
    },
    async finish(id, ok, failed) {
      const { error } = await db.from('notification_log').update({ devices_ok: ok, devices_failed: failed }).eq('id', id);
      if (error) throw error;
    },
    async markSuccess(id) {
      await db.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0, last_error: null }).eq('id', id);
    },
    async markFailure(id, message) {
      const { data } = await db.from('push_subscriptions').select('failure_count').eq('id', id).maybeSingle();
      const count = ((data as { failure_count?: number } | null)?.failure_count ?? 0) + 1;
      await db.from('push_subscriptions').update({ failure_count: count, last_error: message }).eq('id', id);
    },
    async removeSubscription(id) {
      await db.from('push_subscriptions').delete().eq('id', id);
    },
  };
}

async function main() {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SECRET_KEY');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const data = await load(db);
  if (!data) {
    console.log('No hay temporadas activas: nada que enviar.');
    return;
  }
  const subscribedUsers = new Set(data.subs.map((s) => s.user_id));
  const settings = new Map(data.settingsRows.map(({ user_id, ...s }) => [user_id, s]));
  const planned = planNotifications({
    now: new Date(),
    groups: data.groups,
    seasons: data.seasons,
    members: data.members,
    matches: data.matches,
    workouts: data.workouts,
    settings,
    subscribedUsers,
    log: data.log,
  });
  console.log(`Dispositivos suscritos: ${data.subs.length}. Avisos que tocan ahora: ${planned.length}.`);
  if (dryRun) {
    for (const p of planned) console.log(`- [${p.kind}] ${p.userId.slice(0, 8)}… ${p.body}`);
    return;
  }
  if (planned.length === 0) return;

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const report = await deliver(
    planned,
    data.subs,
    (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 12 * 3600, urgency: 'normal' }),
    storeFor(db),
  );
  console.log(
    `Enviados: ${report.sent} · ya enviados antes: ${report.skippedDuplicates} · entregas fallidas: ${report.failedDeliveries} · suscripciones eliminadas: ${report.removedSubscriptions}`,
  );
}

main().catch((e) => {
  console.error('Error en el envío de notificaciones:', e instanceof Error ? e.message : e);
  process.exit(1);
});
