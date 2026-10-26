// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

/**
 * Pruebas de seguridad contra Postgres real con las migraciones del repositorio.
 * Escenario: grupo G1 (A propietario, B miembro), grupo G2 (C propietario),
 * D registrado sin grupo.
 */
let t: TestDb;
let A: string, B: string, C: string, D: string;
let G1: string, G2: string, S1: string;

type Row = Record<string, unknown>;

async function q<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await t.db.query<T>(sql, params);
  return res.rows;
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

function workoutValues(group: string, overrides: Partial<Record<string, unknown>> = {}) {
  const v = {
    group_id: group,
    activity_date: '2026-10-20',
    activity_type: 'run',
    source: 'strava',
    entry_method: 'ocr',
    distance_value: 8.42,
    distance_unit: 'km',
    distance_km: 8.42,
    duration_s: 2911,
    fingerprint: 'fp-' + crypto.randomUUID().slice(0, 12),
    client_request_id: crypto.randomUUID(),
    ...overrides,
  };
  return v;
}

async function insertWorkout(v: Record<string, unknown>) {
  const keys = Object.keys(v);
  const params = keys.map((_, i) => `$${i + 1}`).join(', ');
  return q(
    `insert into public.workouts (${keys.join(', ')}) values (${params}) returning id, user_id, week_start::text as week_start, validation_status`,
    Object.values(v),
  );
}

beforeAll(async () => {
  t = await createTestDb();
  A = await t.createUser('Árbitro A');
  B = await t.createUser('Árbitro B');
  C = await t.createUser('Árbitro C');
  D = await t.createUser('Árbitro D');

  G1 = await t.as(A, async () => (await q<{ id: string }>(`select public.create_group('Liga Norte', 'Europe/Madrid') as id`))[0]!.id);
  G2 = await t.as(C, async () => (await q<{ id: string }>(`select public.create_group('Otro grupo', 'Europe/Madrid') as id`))[0]!.id);

  S1 = await t.as(A, async () =>
    (await q<{ id: string }>(
      `insert into public.seasons (group_id, name, start_date, end_date, status)
       values ($1, 'Temporada 26/27', '2026-09-01', '2027-06-30', 'active') returning id`,
      [G1],
    ))[0]!.id,
  );

  const code = await t.as(A, async () =>
    (await q<{ code: string }>(`select code from public.create_invitation($1, 'member', 2, 7, 'Equipo')`, [G1]))[0]!.code,
  );
  await t.as(B, () => q(`select public.accept_invitation($1)`, [code.toLowerCase()]));
}, 60000);

describe('RLS habilitada', () => {
  it('todas las tablas del esquema public tienen RLS activada', async () => {
    const rows = await t.admin(() =>
      q<{ relname: string; relrowsecurity: boolean }>(
        `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'`,
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
  });

  it('el rol anon no puede leer datos', async () => {
    await expectError(t.as(null, () => q(`select * from public.workouts`)), /permission denied/);
    await expectError(t.as(null, () => q(`select * from public.profiles`)), /permission denied/);
  });

  it('app_settings e invite_attempts son inaccesibles para usuarios', async () => {
    await expectError(t.as(A, () => q(`select * from public.app_settings`)), /permission denied/);
    await expectError(t.as(A, () => q(`select * from public.invite_attempts`)), /permission denied/);
  });
});

describe('aislamiento entre grupos', () => {
  it('un usuario de otro grupo no ve datos privados de G1', async () => {
    await t.as(B, () => insertWorkout(workoutValues(G1)));
    const rows = await t.as(C, async () => ({
      groups: await q(`select * from public.groups where id = $1`, [G1]),
      workouts: await q(`select * from public.workouts where group_id = $1`, [G1]),
      seasons: await q(`select * from public.seasons where group_id = $1`, [G1]),
      members: await q(`select * from public.group_members where group_id = $1`, [G1]),
      profiles: await q(`select * from public.profiles where id in ($1, $2)`, [A, B]),
      audit: await q(`select * from public.audit_events where group_id = $1`, [G1]),
    }));
    for (const [name, list] of Object.entries(rows)) expect(list, name).toHaveLength(0);
  });

  it('un usuario sin grupo solo ve su propio perfil', async () => {
    const profiles = await t.as(D, () => q<{ id: string }>(`select id from public.profiles`));
    expect(profiles.map((p) => p.id)).toEqual([D]);
  });

  it('los miembros sí ven los datos compartidos de su grupo', async () => {
    const workouts = await t.as(A, () => q(`select id from public.workouts where group_id = $1`, [G1]));
    expect(workouts.length).toBeGreaterThan(0);
    const profiles = await t.as(A, () => q(`select id from public.profiles where id = $1`, [B]));
    expect(profiles).toHaveLength(1);
  });

  it('no se puede registrar un entrenamiento en un grupo ajeno', async () => {
    await expectError(t.as(B, () => insertWorkout(workoutValues(G2))), /row-level security/);
  });
});

describe('entrenamientos', () => {
  it('no se puede registrar un entrenamiento a nombre de otra persona', async () => {
    await expectError(t.as(B, () => insertWorkout(workoutValues(G1, { user_id: A }))), /permission denied|row-level security/);
  });

  it('el servidor calcula la semana ISO y normaliza unidades', async () => {
    const [row] = await t.as(B, () =>
      insertWorkout(workoutValues(G1, { activity_date: '2026-10-25', distance_value: 301, distance_unit: 'm', distance_km: 0.301 })),
    );
    expect(row!.week_start).toBe('2026-10-19');
    await expectError(
      t.as(B, () => insertWorkout(workoutValues(G1, { distance_value: 5000, distance_unit: 'm', distance_km: 50 }))),
      /workouts_distance_normalized/,
    );
  });

  it('rechaza distancias no positivas', async () => {
    await expectError(t.as(B, () => insertWorkout(workoutValues(G1, { distance_value: 0, distance_km: 0 }))), /check/);
  });

  it('la clave de idempotencia evita dobles envíos', async () => {
    const v = workoutValues(G1);
    await t.as(B, () => insertWorkout(v));
    await expectError(t.as(B, () => insertWorkout(v)), /workouts_idempotency/);
  });

  it('un usuario no puede editar ni borrar entrenamientos ajenos', async () => {
    const [w] = await t.as(A, () => insertWorkout(workoutValues(G1)));
    const updated = await t.as(B, () => q(`update public.workouts set distance_km = 50, distance_value = 50 where id = $1 returning id`, [w!.id]));
    expect(updated).toHaveLength(0);
    const deleted = await t.as(B, () => q(`delete from public.workouts where id = $1 returning id`, [w!.id]));
    expect(deleted).toHaveLength(0);
  });

  it('un administrador puede moderar pero no alterar los datos de otro', async () => {
    const [w] = await t.as(B, () => insertWorkout(workoutValues(G1)));
    await expectError(
      t.as(A, () => q(`update public.workouts set distance_km = 1, distance_value = 1 where id = $1`, [w!.id])),
      /Solo puedes cambiar el estado/,
    );
    const [r] = await t.as(A, () =>
      q<{ validation_status: string }>(
        `update public.workouts set validation_status = 'rejected', review_note = 'Captura duplicada' where id = $1 returning validation_status`,
        [w!.id],
      ),
    );
    expect(r!.validation_status).toBe('rejected');
  });

  it('un miembro no puede autovalidarse y su edición de un rechazado pasa a pendiente', async () => {
    const [w] = await t.as(B, () => insertWorkout(workoutValues(G1)));
    await t.as(A, () => q(`update public.workouts set validation_status = 'rejected' where id = $1`, [w!.id]));
    const [still] = await t.as(B, () =>
      q<{ validation_status: string }>(`update public.workouts set validation_status = 'confirmed' where id = $1 returning validation_status`, [w!.id]),
    );
    expect(still!.validation_status).toBe('rejected');
    const [edited] = await t.as(B, () =>
      q<{ validation_status: string }>(
        `update public.workouts set distance_value = 9, distance_km = 9 where id = $1 returning validation_status`,
        [w!.id],
      ),
    );
    expect(edited!.validation_status).toBe('pending');
  });

  it('con revisión obligatoria, los registros manuales quedan pendientes', async () => {
    await t.as(A, () => q(`update public.seasons set manual_requires_review = true where id = $1`, [S1]));
    const [row] = await t.as(B, () => insertWorkout(workoutValues(G1, { entry_method: 'manual', source: 'manual' })));
    expect(row!.validation_status).toBe('pending');
    await t.as(A, () => q(`update public.seasons set manual_requires_review = false where id = $1`, [S1]));
  });

  it('el borrado queda registrado en la auditoría', async () => {
    const [w] = await t.as(B, () => insertWorkout(workoutValues(G1)));
    await t.as(B, () => q(`delete from public.workouts where id = $1`, [w!.id]));
    const events = await t.as(A, () =>
      q<{ action: string; before: { distance_km: string } }>(
        `select action, before from public.audit_events where entity_type = 'workouts' and entity_id = $1 order by id`,
        [w!.id],
      ),
    );
    expect(events.map((e) => e.action)).toEqual(['insert', 'delete']);
    expect(Number(events[1]!.before.distance_km)).toBeCloseTo(8.42);
  });

  it('los clientes no pueden escribir en audit_events', async () => {
    await expectError(
      t.as(A, () => q(`insert into public.audit_events (group_id, entity_type, entity_id, action) values ($1, 'x', 'y', 'insert')`, [G1])),
      /permission denied/,
    );
  });
});

describe('partidos y objetivos', () => {
  it('un miembro registra su partido y el objetivo es la suma de goles', async () => {
    const [m] = await t.as(B, () =>
      q<{ target_km: number }>(
        `insert into public.matches (group_id, season_id, referee_id, match_date, week_start, home_goals, away_goals)
         values ($1, $2, $3, '2026-10-17', '2026-10-19', 13, 1) returning target_km`,
        [G1, S1, B],
      ),
    );
    expect(m!.target_km).toBe(14);
  });

  it('impide duplicar el partido del mismo árbitro en la misma semana', async () => {
    await expectError(
      t.as(B, () =>
        q(
          `insert into public.matches (group_id, season_id, referee_id, match_date, week_start, home_goals, away_goals)
           values ($1, $2, $3, '2026-10-18', '2026-10-19', 2, 2)`,
          [G1, S1, B],
        ),
      ),
      /matches_one_per_referee_week/,
    );
  });

  it('un miembro no puede asignar partidos a otro árbitro', async () => {
    await expectError(
      t.as(B, () =>
        q(
          `insert into public.matches (group_id, season_id, referee_id, match_date, week_start, home_goals, away_goals)
           values ($1, $2, $3, '2026-10-17', '2026-10-19', 4, 7)`,
          [G1, S1, A],
        ),
      ),
      /row-level security/,
    );
  });

  it('rechaza semanas que no empiezan en lunes o fuera de la temporada', async () => {
    await expectError(
      t.as(B, () =>
        q(
          `insert into public.matches (group_id, season_id, referee_id, match_date, week_start, home_goals, away_goals)
           values ($1, $2, $3, '2026-10-24', '2026-10-27', 1, 1)`,
          [G1, S1, B],
        ),
      ),
      /check/,
    );
    await expectError(
      t.as(A, () =>
        q(
          `insert into public.matches (group_id, season_id, referee_id, match_date, week_start, home_goals, away_goals)
           values ($1, $2, $3, '2026-08-01', '2026-08-03', 1, 1)`,
          [G1, S1, A],
        ),
      ),
      /fuera de la temporada/,
    );
  });

  it('una corrección exige motivo, actualiza el objetivo y queda auditada', async () => {
    const [m] = await t.as(A, () =>
      q<{ id: string }>(
        `insert into public.matches (group_id, season_id, referee_id, match_date, week_start, home_goals, away_goals)
         values ($1, $2, $3, '2026-10-10', '2026-10-12', 4, 7) returning id`,
        [G1, S1, B],
      ),
    );
    await expectError(t.as(A, () => q(`update public.matches set home_goals = 5 where id = $1`, [m!.id])), /motivo/);
    const [u] = await t.as(A, () =>
      q<{ target_km: number }>(
        `update public.matches set home_goals = 5, change_reason = 'Acta corregida' where id = $1 returning target_km`,
        [m!.id],
      ),
    );
    expect(u!.target_km).toBe(12);
    const [ev] = await t.as(B, () =>
      q<{ reason: string; before: { target_km: number }; after: { target_km: number } }>(
        `select reason, before, after from public.audit_events where entity_id = $1 and action = 'update'`,
        [m!.id],
      ),
    );
    expect(ev!.reason).toBe('Acta corregida');
    expect(ev!.before.target_km).toBe(11);
    expect(ev!.after.target_km).toBe(12);
  });

  it('un miembro no puede corregir partidos fuera del periodo de gracia', async () => {
    const [m] = await t.as(A, () =>
      q<{ id: string }>(
        `insert into public.matches (group_id, season_id, referee_id, match_date, week_start, home_goals, away_goals)
         values ($1, $2, $3, '2026-10-03', '2026-10-05', 2, 3) returning id`,
        [G1, S1, B],
      ),
    );
    const updated = await t.as(B, () =>
      q(`update public.matches set home_goals = 0, change_reason = 'x' where id = $1 returning id`, [m!.id]),
    );
    expect(updated).toHaveLength(0);
  });
});

describe('administración del grupo', () => {
  it('un miembro no puede cambiar reglas protegidas de la temporada', async () => {
    const updated = await t.as(B, () =>
      q(`update public.seasons set compliance_policy = 'carry_forward' where id = $1 returning id`, [S1]),
    );
    expect(updated).toHaveLength(0);
    await expectError(
      t.as(B, () =>
        q(`insert into public.seasons (group_id, name, start_date, end_date) values ($1, 'Pirata', '2027-08-01', '2027-09-01')`, [G1]),
      ),
      /row-level security/,
    );
  });

  it('un miembro no puede ascenderse a administrador', async () => {
    const updated = await t.as(B, () =>
      q(`update public.group_members set role = 'admin' where group_id = $1 and user_id = $2 returning role`, [G1, B]),
    );
    expect(updated).toHaveLength(0);
  });

  it('un miembro no puede crear invitaciones ni verlas', async () => {
    await expectError(t.as(B, () => q(`select * from public.create_invitation($1)`, [G1])), /administrador/);
    const rows = await t.as(B, () => q(`select id from public.invitations`));
    expect(rows).toHaveLength(0);
  });

  it('el hash del código de invitación no es legible ni siquiera por administradores', async () => {
    await expectError(t.as(A, () => q(`select code_hash from public.invitations`)), /permission denied/);
  });

  it('el propietario no puede ser degradado', async () => {
    await expectError(
      t.as(A, () => q(`update public.group_members set role = 'member' where group_id = $1 and user_id = $2`, [G1, A])),
      /propietario/,
    );
  });

  it('un perfil solo lo modifica su dueño y solo en campos autorizados', async () => {
    const other = await t.as(B, () => q(`update public.profiles set display_name = 'Hackeado' where id = $1 returning id`, [A]));
    expect(other).toHaveLength(0);
    const own = await t.as(B, () =>
      q<{ display_name: string }>(`update public.profiles set display_name = 'B. Silbato' where id = $1 returning display_name`, [B]),
    );
    expect(own[0]!.display_name).toBe('B. Silbato');
    await expectError(t.as(B, () => q(`update public.profiles set created_at = now() where id = $1`, [B])), /permission denied/);
  });

  it('las invitaciones inválidas, caducadas o agotadas se rechazan', async () => {
    await expectError(t.as(D, () => q(`select public.accept_invitation('AAAAA-BBBBB')`)), /no válido/);
    const code = await t.as(A, async () =>
      (await q<{ code: string }>(`select code from public.create_invitation($1, 'member', 1, 1)`, [G1]))[0]!.code,
    );
    await t.as(D, () => q(`select public.accept_invitation($1)`, [code]));
    const E = await t.createUser('Árbitro E');
    await expectError(t.as(E, () => q(`select public.accept_invitation($1)`, [code])), /no válido/);
  });

  it('un miembro desactivado pierde el acceso', async () => {
    await t.as(A, () => q(`update public.group_members set status = 'inactive' where group_id = $1 and user_id = $2`, [G1, D]));
    const rows = await t.as(D, () => q(`select id from public.workouts where group_id = $1`, [G1]));
    expect(rows).toHaveLength(0);
  });

  it('la creación de grupos puede bloquearse tras la configuración inicial', async () => {
    await t.admin(() => q(`update public.app_settings set allow_group_creation = false`));
    await expectError(t.as(D, () => q(`select public.create_group('Grupo intruso')`)), /deshabilitada/);
    await t.admin(() => q(`update public.app_settings set allow_group_creation = true`));
  });

  it('una temporada cerrada no admite nuevos registros', async () => {
    const S2 = await t.as(C, async () =>
      (await q<{ id: string }>(
        `insert into public.seasons (group_id, name, start_date, end_date, status) values ($1, 'Pasada', '2025-09-01', '2026-06-30', 'closed') returning id`,
        [G2],
      ))[0]!.id,
    );
    expect(S2).toBeTruthy();
    await expectError(
      t.as(C, () => insertWorkout(workoutValues(G2, { activity_date: '2026-01-10' }))),
      /cerrada/,
    );
  });
});
