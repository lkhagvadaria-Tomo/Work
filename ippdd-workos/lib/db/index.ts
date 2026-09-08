import "server-only";
import pg, { Pool, type PoolClient } from "pg";
import { env } from "@/lib/env";

// DATE columns come back as plain ISO strings (types/db.ts contract) instead of
// JS Date objects — avoids TZ drift on deadline comparisons and React render errors.
pg.types.setTypeParser(1082, (v: string) => v);

/**
 * Data layer with database-enforced authorization (docs/DECISIONS.md D-002).
 *
 * Every request-scoped query runs inside a transaction as role `authenticated`
 * with `request.jwt.claims` set to the caller's identity, so Row Level Security
 * decides what each user can see or change — identically on local PostgreSQL
 * and Supabase Postgres. The application never builds authorization out of
 * frontend checks alone.
 */

declare global {
  // reuse the pool across HMR reloads in dev
  var __workosPool: Pool | undefined;
}

function pool(): Pool {
  if (!global.__workosPool) {
    global.__workosPool = new Pool({
      connectionString: env().DATABASE_URL,
      max: 10,
      // Supabase requires TLS; local Postgres does not offer it.
      ssl: env().DATABASE_URL.includes("supabase.co")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return global.__workosPool;
}

export interface Queryable {
  query<R = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

/**
 * A transaction uses a single client; Promise.all over it would interleave
 * queries on one connection (deprecated in pg). This wrapper queues them so
 * callers may still write Promise.all for readability.
 */
function serialize(client: PoolClient): Queryable {
  let chain: Promise<unknown> = Promise.resolve();
  return {
    query<R>(text: string, params?: unknown[]) {
      const run = chain.then(() => client.query(text, params)) as Promise<{
        rows: R[];
        rowCount: number | null;
      }>;
      chain = run.catch(() => undefined);
      return run;
    },
  };
}

/**
 * Run `fn` in a transaction authenticated as the given auth user (RLS applies).
 * Rolls back on any error.
 */
export async function withUser<T>(
  authUid: string,
  fn: (tx: Queryable) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(authUid)) throw new Error("invalid auth uid");
  const client: PoolClient = await pool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: authUid, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    const result = await fn(serialize(client));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** One-shot query as a user. */
export async function queryAs<R = Record<string, unknown>>(
  authUid: string,
  text: string,
  params?: unknown[],
): Promise<R[]> {
  return withUser(authUid, async (tx) => {
    const { rows } = await tx.query<R>(text, params);
    return rows;
  });
}

/**
 * Privileged path — used ONLY for identity linking on first sign-in and for
 * system jobs. Every use must write an audit entry itself.
 */
export async function withService<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const result = await fn(serialize(client));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
