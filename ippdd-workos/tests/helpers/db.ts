import { execSync } from "node:child_process";
import path from "node:path";
import { Pool, type PoolClient } from "pg";

/**
 * Test database helpers. Integration/RLS suites run against a dedicated
 * `workos_test` database, re-provisioned from the version-controlled
 * migrations + seeds before each suite (reproducibility, §47).
 */
export const TEST_DB = "workos_test";
export const APP_URL = `postgres://workos:workos@localhost:5432/${TEST_DB}`;
export const SERVICE_URL = `postgres://workos_service:workos_service@localhost:5432/${TEST_DB}`;

export const AUTH = {
  DIRECTOR: "00000000-0000-4000-8000-000000000001",
  LA: "00000000-0000-4000-8000-000000000002",
  REVIEWER: "00000000-0000-4000-8000-000000000003",
  ADMIN: "00000000-0000-4000-8000-000000000004",
  OUTSIDER: "00000000-0000-4000-8000-000000000099",
} as const;

export const EMP = {
  DIRECTOR: "e0000000-0000-4000-8000-000000000001",
  LA: "e0000000-0000-4000-8000-000000000002",
  REVIEWER: "e0000000-0000-4000-8000-000000000003",
  ADMIN: "e0000000-0000-4000-8000-000000000004",
} as const;

export function resetTestDb(): void {
  execSync(`WORKOS_DB=${TEST_DB} bash scripts/db/local-setup.sh`, {
    cwd: path.resolve(__dirname, "../.."),
    stdio: "pipe",
  });
  // an extra employee in the SAME department but unrelated to LA's work,
  // for unrelated-visibility tests (not a manager, not reviewer/approver)
  execSync(
    `su postgres -c "psql -q -d ${TEST_DB} -c \\"insert into employees
      (id, auth_user_id, employee_code, email, full_name, department_id, system_role)
      values ('e0000000-0000-4000-8000-000000000099', '${AUTH.OUTSIDER}',
        'HQ_IPPDD_XX', 'outsider@netgroup.mn', 'Outsider Test',
        'd0000000-0000-4000-8000-000000000001', 'EMPLOYEE');\\""`,
    { stdio: "pipe" },
  );
}

export function appPool(): Pool {
  return new Pool({ connectionString: APP_URL, max: 4 });
}
export function servicePool(): Pool {
  return new Pool({ connectionString: SERVICE_URL, max: 2 });
}

/** Run fn as a signed-in user with RLS enforced; commits on success. */
export async function asUser<T>(
  pool: Pool,
  authUid: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: authUid, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function expectDbError<T>(p: Promise<T>, pattern: RegExp): Promise<void> {
  try {
    await p;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!pattern.test(msg)) {
      throw new Error(`error did not match ${pattern}: ${msg}`);
    }
    return;
  }
  throw new Error(`expected an error matching ${pattern}, but the call succeeded`);
}
