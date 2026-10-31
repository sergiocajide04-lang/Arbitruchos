/**
 * Entrega de notificaciones ya planificadas (servidor; nunca se incluye en el
 * bundle del navegador). El envío real y la base de datos se inyectan para
 * poder probar la lógica sin red.
 *
 *   1. Se «reclama» cada aviso insertándolo en notification_log. La restricción
 *      única (usuario, tipo, periodo) hace que, si dos ejecuciones coinciden,
 *      solo una lo envíe: nunca hay duplicados.
 *   2. Se envía a todos los dispositivos del usuario.
 *   3. 404/410 del servicio push = suscripción caducada o eliminada: se borra.
 *      Otros errores se anotan; tras MAX_FAILURES seguidos se borra también.
 */
import type { PlannedNotification } from '@/domain/notifications/plan';

export const MAX_FAILURES = 10;

export interface PushTarget {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

export type SendFn = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

export interface DeliveryStore {
  /** Inserta el aviso en el registro; null si ya existía (otro proceso lo envió). */
  claim(n: PlannedNotification): Promise<number | null>;
  finish(logId: number, ok: number, failed: number): Promise<void>;
  markSuccess(subscriptionId: string): Promise<void>;
  markFailure(subscriptionId: string, message: string): Promise<void>;
  removeSubscription(subscriptionId: string): Promise<void>;
}

export interface DeliveryReport {
  sent: number;
  skippedDuplicates: number;
  failedDeliveries: number;
  removedSubscriptions: number;
}

function statusOf(err: unknown): number | null {
  const code = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === 'number' ? code : null;
}

export async function deliver(
  planned: readonly PlannedNotification[],
  subscriptions: readonly PushTarget[],
  send: SendFn,
  store: DeliveryStore,
): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, skippedDuplicates: 0, failedDeliveries: 0, removedSubscriptions: 0 };
  for (const n of planned) {
    const targets = subscriptions.filter((s) => s.user_id === n.userId);
    if (targets.length === 0) continue;
    const logId = await store.claim(n);
    if (logId === null) {
      report.skippedDuplicates++;
      continue;
    }
    const payload = JSON.stringify({ title: n.title, body: n.body, path: n.path, tag: `refrun-${n.kind}` });
    let ok = 0;
    let failed = 0;
    for (const sub of targets) {
      try {
        await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        ok++;
        await store.markSuccess(sub.id);
      } catch (err) {
        failed++;
        const status = statusOf(err);
        if (status === 404 || status === 410 || sub.failure_count + 1 >= MAX_FAILURES) {
          await store.removeSubscription(sub.id);
          report.removedSubscriptions++;
        } else {
          const message = status ? `HTTP ${status}` : err instanceof Error ? err.message : 'error desconocido';
          await store.markFailure(sub.id, message.slice(0, 300));
        }
      }
    }
    await store.finish(logId, ok, failed);
    if (ok > 0) report.sent++;
    report.failedDeliveries += failed;
  }
  return report;
}
