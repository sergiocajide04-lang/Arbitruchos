import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Postgres real (PGlite/WASM) con los elementos mínimos de Supabase:
 * roles anon/authenticated/service_role, esquema auth con auth.users y auth.uid(),
 * y los privilegios por defecto que Supabase concede en el esquema public.
 * Después aplica las migraciones del repositorio en orden.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export interface TestDb {
  db: PGlite;
  /** Crea un usuario en auth.users (dispara la creación de perfil). */
  createUser(name: string): Promise<string>;
  /** Ejecuta fn como rol authenticated con auth.uid() = uid. */
  as<T>(uid: string | null, fn: () => Promise<T>): Promise<T>;
  /** Ejecuta fn como superusuario (equivalente al SQL editor). */
  admin<T>(fn: () => Promise<T>): Promise<T>;
}

let userCounter = 0;

export async function createTestDb(): Promise<TestDb> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUB);

  const dir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }

  async function resetRole() {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }

  return {
    db,
    async createUser(name) {
      userCounter += 1;
      const id = crypto.randomUUID();
      await db.query(
        `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
        [id, `user${userCounter}@example.test`, JSON.stringify({ display_name: name })],
      );
      return id;
    },
    async as(uid, fn) {
      await db.exec(uid ? 'set role authenticated' : 'set role anon');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
      try {
        return await fn();
      } finally {
        await resetRole();
      }
    },
    async admin(fn) {
      await resetRole();
      return fn();
    },
  };
}
