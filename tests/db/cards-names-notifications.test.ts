// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

/**
 * Migraciones 004 (tarjetas, nombres de 20 caracteres, metodología definitiva)
 * y 005 (notificaciones) contra Postgres real. Grupo G1: A propietario, B
 * miembro. Grupo G2: C propietario.
 */
let t: TestDb;
let A: string, B: string, C: string;
let G1: string, S1: string;

type Row = Record<string, unknown>;
async function q<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await t.db.query<T>(sql, params)).rows;
}
async function expectError(promise: Promise<unknown>, pattern?: RegExp) {
  let error: unknown = null;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  expect(error, 'se esperaba un error').not.toBeNull();
  if (pattern) expect(String((error as Error).message)).toMatch(pattern);
}
const insertMatch = (uid: string, week: string, goals: [number, number], cards = '') =>
  t.as(uid, () =>
    q<{ id: string; target_km: number }>(
      `insert into public.matches (group_id, season_id, referee_id, match_date, week_start, home_goals, away_goals${cards ? ', yellow_cards, blue_cards, red_cards' : ''})
       values ($1, $2, $3, $4::date - 2, $4, $5, $6${cards ? `, ${cards}` : ''}) returning id, target_km`,
      [G1, S1, uid, week, goals[0], goals[1]],
    ),
  );

beforeAll(async () => {
  t = await createTestDb();
  A = await t.createUser('Sergio Cajide');
  B = await t.createUser('Cristian Fernández');
  C = await t.createUser('Árbitro C');
  G1 = await t.as(A, async () => (await q<{ id: string }>(`select public.create_group('Liga Norte', 'Europe/Madrid') as id`))[0]!.id);
  await t.as(C, () => q(`select public.create_group('Otro grupo', 'Europe/Madrid')`));
  S1 = await t.as(A, async () =>
    (await q<{ id: string }>(
      `insert into public.seasons (group_id, name, start_date, end_date, status) values ($1, 'T 26/27', '2026-09-01', '2027-06-30', 'active') returning id`,
      [G1],
    ))[0]!.id,
  );
  const code = await t.as(A, async () => (await q<{ code: string }>(`select code from public.create_invitation($1, 'member', 1, 7, null)`, [G1]))[0]!.code);
  await t.as(B, () => q(`select public.accept_invitation($1)`, [code]));
});

describe('tarjetas y objetivo del partido', () => {
  it('13-1 con 2 amarillas, 1 azul y 1 roja genera 23 km (calculado por la base de datos)', async () => {
    const [m] = await insertMatch(B, '2026-10-05', [13, 1], '2, 1, 1');
    expect(m!.target_km).toBe(23);
  });

  it('sin indicar tarjetas cuenta 0 (partidos anteriores a la actualización)', async () => {
    const [m] = await insertMatch(B, '2026-10-12', [13, 1]);
    expect(m!.target_km).toBe(14);
  });

  it('rechaza tarjetas negativas', async () => {
    await expectError(insertMatch(B, '2026-10-19', [1, 1], '-1, 0, 0'), /check constraint/);
  });

  it('no se puede escribir target_km a mano', async () => {
    await expectError(
      t.as(B, () =>
        q(
          `insert into public.matches (group_id, season_id, referee_id, match_date, week_start, home_goals, away_goals, target_km)
           values ($1, $2, $3, '2026-10-24', '2026-10-26', 1, 1, 99)`,
          [G1, S1, B],
        ),
      ),
    );
  });

  it('corregir las tarjetas exige motivo y recalcula el objetivo', async () => {
    const [m] = await insertMatch(A, '2026-10-05', [3, 2]);
    await expectError(t.as(A, () => q(`update public.matches set red_cards = 1 where id = $1`, [m!.id])), /motivo/);
    const [u] = await t.as(A, () =>
      q<{ target_km: number }>(`update public.matches set red_cards = 1, change_reason = 'Acta' where id = $1 returning target_km`, [m!.id]),
    );
    expect(u!.target_km).toBe(10);
  });
});

describe('nombre visible de 20 caracteres', () => {
  it('admite 20 caracteres al registrarse', async () => {
    const id = await t.createUser('Cristian Fernández G');
    const [p] = await t.admin(() => q<{ display_name: string }>(`select display_name from public.profiles where id = $1`, [id]));
    expect(p!.display_name).toBe('Cristian Fernández G');
  });

  it('rechaza 21 caracteres al registrarse, sin recortar', async () => {
    await expectError(t.createUser('Cristian Fernández Go'), /20 caracteres/);
  });

  it('rechaza una edición que supere el límite, aunque se envíe la petición a mano', async () => {
    await expectError(
      t.as(B, () => q(`update public.profiles set display_name = $1 where id = $2`, ['x'.repeat(21), B])),
      /profiles_display_name_max_20/,
    );
    const ok = await t.as(B, () => q(`update public.profiles set display_name = $1 where id = $2 returning id`, ['x'.repeat(20), B]));
    expect(ok).toHaveLength(1);
  });

  it('la restricción no invalida perfiles antiguos (NOT VALID): no se pierde ningún nombre', async () => {
    const [c] = await t.admin(() =>
      q<{ convalidated: boolean }>(`select convalidated from pg_constraint where conname = 'profiles_display_name_max_20'`),
    );
    expect(c!.convalidated).toBe(false);
  });
});

describe('metodología definitiva', () => {
  it('las temporadas usan compensación de deudas y no se puede cambiar', async () => {
    const [s] = await t.admin(() => q<{ compliance_policy: string }>(`select compliance_policy::text from public.seasons where id = $1`, [S1]));
    expect(s!.compliance_policy).toBe('carry_forward');
    await expectError(
      t.as(A, () => q(`update public.seasons set compliance_policy = 'season_total' where id = $1`, [S1])),
      /seasons_compliance_policy_definitive/,
    );
  });
});

describe('notificaciones: preferencias, dispositivos y registro', () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';

  it('cada usuario guarda sus preferencias y no ve las de otros', async () => {
    await t.as(B, () => q(`insert into public.notification_settings (user_id, km_days, remind_hour) values ($1, '{3,6}', 9)`, [B]));
    expect(await t.as(A, () => q(`select * from public.notification_settings where user_id = $1`, [B]))).toHaveLength(0);
    await expectError(t.as(A, () => q(`insert into public.notification_settings (user_id) values ($1)`, [B])), /row-level security/);
    const upd = await t.as(A, () => q(`update public.notification_settings set enabled = false where user_id = $1 returning user_id`, [B]));
    expect(upd).toHaveLength(0);
  });

  it('valida días distintos y horas diurnas', async () => {
    await expectError(t.as(B, () => q(`update public.notification_settings set km_days = '{2,2}' where user_id = $1`, [B])), /check constraint/);
    await expectError(t.as(B, () => q(`update public.notification_settings set remind_hour = 23 where user_id = $1`, [B])), /check constraint/);
  });

  it('registra el dispositivo con la RPC y no expone sus claves', async () => {
    await t.as(B, () => q(`select public.register_push_subscription($1, $2, $3, 'Android Chrome')`, [endpoint, 'p'.repeat(40), 'a'.repeat(16)]));
    const own = await t.as(B, () => q(`select id, endpoint from public.push_subscriptions`));
    expect(own).toHaveLength(1);
    await expectError(t.as(B, () => q(`select p256dh from public.push_subscriptions`)), /permission denied/);
    expect(await t.as(A, () => q(`select id from public.push_subscriptions`))).toHaveLength(0);
  });

  it('si otra cuenta usa el mismo navegador, el dispositivo pasa a esa cuenta', async () => {
    await t.as(A, () => q(`select public.register_push_subscription($1, $2, $3, null)`, [endpoint, 'q'.repeat(40), 'b'.repeat(16)]));
    expect(await t.as(B, () => q(`select id from public.push_subscriptions`))).toHaveLength(0);
    expect(await t.as(A, () => q(`select id from public.push_subscriptions`))).toHaveLength(1);
  });

  it('los clientes no pueden insertar suscripciones ni escribir en el registro de envíos', async () => {
    await expectError(
      t.as(B, () => q(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://x', $2, $3)`, [B, 'p'.repeat(40), 'a'.repeat(16)])),
      /permission denied/,
    );
    await expectError(
      t.as(B, () => q(`insert into public.notification_log (user_id, kind, period_key, title, body) values ($1, 'test', 'k', 't', 'b')`, [B])),
      /permission denied/,
    );
  });

  it('el registro de envíos impide duplicados por (usuario, tipo, periodo)', async () => {
    const ins = `insert into public.notification_log (user_id, kind, period_key, title, body) values ($1, 'km_reminder', 'p:2026-10-27', 'REFRUN', 'x')`;
    await t.admin(() => q(ins, [B]));
    await expectError(t.admin(() => q(ins, [B])), /notification_log_once/);
    expect(await t.as(B, () => q(`select id from public.notification_log`))).toHaveLength(1);
    expect(await t.as(A, () => q(`select id from public.notification_log`))).toHaveLength(0);
  });

  it('anon no accede a nada de notificaciones', async () => {
    await expectError(t.as(null, () => q(`select * from public.notification_settings`)), /permission denied/);
    await expectError(t.as(null, () => q(`select public.register_push_subscription('https://x', 'p', 'a', null)`)), /permission denied/);
  });

  it('solo un administrador cambia los días y la hora del recordatorio de partido', async () => {
    const byMember = await t.as(B, () => q(`update public.groups set match_reminder_days = '{1}' where id = $1 returning id`, [G1]));
    expect(byMember).toHaveLength(0);
    const [g] = await t.as(A, () =>
      q<{ match_reminder_hour: number }>(`update public.groups set match_reminder_days = '{7}', match_reminder_hour = 21 where id = $1 returning match_reminder_hour`, [G1]),
    );
    expect(g!.match_reminder_hour).toBe(21);
    await expectError(t.as(A, () => q(`update public.groups set match_reminder_hour = 3 where id = $1`, [G1])), /check constraint/);
  });
});
