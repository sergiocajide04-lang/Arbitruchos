import { describe, expect, it, vi } from 'vitest';
import type { PlannedNotification } from '@/domain/notifications/plan';
import { MAX_FAILURES, deliver, type DeliveryStore, type PushTarget } from './deliver';

const planned: PlannedNotification = {
  userId: 'u1',
  groupId: 'g1',
  kind: 'km_reminder',
  periodKey: 'p:2026-10-27',
  title: 'REFRUN',
  body: 'REFRUN: Te quedan 6,5 km para completar tus objetivos pendientes.',
  path: '',
  pendingKm: 6.5,
};
const sub = (id: string, failure_count = 0): PushTarget => ({ id, user_id: 'u1', endpoint: `https://push.example/${id}`, p256dh: 'k'.repeat(20), auth: 'a'.repeat(10), failure_count });

function memoryStore(alreadySent = false) {
  const store = {
    claimed: [] as PlannedNotification[],
    finished: [] as Array<[number, number, number]>,
    removed: [] as string[],
    failures: [] as Array<[string, string]>,
    successes: [] as string[],
    claim: vi.fn(async (n: PlannedNotification) => {
      if (alreadySent) return null;
      store.claimed.push(n);
      return 1;
    }),
    finish: vi.fn(async (id: number, ok: number, failed: number) => void store.finished.push([id, ok, failed])),
    markSuccess: vi.fn(async (id: string) => void store.successes.push(id)),
    markFailure: vi.fn(async (id: string, m: string) => void store.failures.push([id, m])),
    removeSubscription: vi.fn(async (id: string) => void store.removed.push(id)),
  };
  return store satisfies DeliveryStore;
}

const httpError = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

describe('entrega de notificaciones', () => {
  it('envía a todos los dispositivos del usuario y registra el resultado', async () => {
    const store = memoryStore();
    const send = vi.fn(async () => undefined);
    const r = await deliver([planned], [sub('a'), sub('b')], send, store);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse((send.mock.calls[0] as unknown as [unknown, string])[1])).toMatchObject({ body: planned.body, tag: 'refrun-km_reminder' });
    expect(r).toEqual({ sent: 1, skippedDuplicates: 0, failedDeliveries: 0, removedSubscriptions: 0 });
    expect(store.finished).toEqual([[1, 2, 0]]);
  });

  it('no envía un aviso que otra ejecución ya reclamó (sin duplicados)', async () => {
    const store = memoryStore(true);
    const send = vi.fn(async () => undefined);
    const r = await deliver([planned], [sub('a')], send, store);
    expect(send).not.toHaveBeenCalled();
    expect(r.skippedDuplicates).toBe(1);
  });

  it('elimina las suscripciones caducadas (404/410) y sigue con las demás', async () => {
    const store = memoryStore();
    const send = vi.fn(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('/gone')) throw httpError(410);
      if (s.endpoint.endsWith('/missing')) throw httpError(404);
    });
    const r = await deliver([planned], [sub('gone'), sub('missing'), sub('ok')], send, store);
    expect(store.removed).toEqual(['gone', 'missing']);
    expect(store.successes).toEqual(['ok']);
    expect(r).toMatchObject({ sent: 1, failedDeliveries: 2, removedSubscriptions: 2 });
  });

  it('anota otros errores y borra la suscripción tras demasiados fallos seguidos', async () => {
    const store = memoryStore();
    const send = vi.fn(async () => {
      throw httpError(500);
    });
    await deliver([planned], [sub('flaky'), sub('dead', MAX_FAILURES - 1)], send, store);
    expect(store.failures).toEqual([['flaky', 'HTTP 500']]);
    expect(store.removed).toEqual(['dead']);
    expect(store.finished).toEqual([[1, 0, 2]]);
  });

  it('sin dispositivos no reclama ni envía nada', async () => {
    const store = memoryStore();
    const send = vi.fn(async () => undefined);
    await deliver([planned], [{ ...sub('x'), user_id: 'otro' }], send, store);
    expect(store.claim).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
