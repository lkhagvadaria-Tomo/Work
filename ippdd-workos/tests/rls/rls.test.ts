import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { AUTH, EMP, appPool, asUser, expectDbError, resetTestDb } from "../helpers/db";

/**
 * RLS/security tests (§45): verified against real policies, not frontend hiding.
 * Personas: LA (owner), REVIEWER (assigned), DIRECTOR (department),
 * ADMIN, OUTSIDER (same department, unrelated employee).
 */
let pool: Pool;

beforeAll(() => {
  resetTestDb();
  pool = appPool();
}, 120_000);

afterAll(async () => {
  await pool.end();
});

const count = async (uid: string, sql: string, params: unknown[] = []) =>
  asUser(pool, uid, async (c) => Number((await c.query(sql, params)).rows[0]?.n ?? 0));

describe("row level security", () => {
  it("no claims → no rows anywhere", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      for (const t of ["work_items", "key_results", "objectives", "evidence", "notifications", "audit_logs"]) {
        const { rows } = await client.query(`select count(*) as n from ${t}`);
        expect(Number(rows[0].n), t).toBe(0);
      }
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("owner sees own work; unrelated employee in the same department sees none", async () => {
    expect(await count(AUTH.LA, "select count(*) as n from work_items")).toBe(5);
    expect(await count(AUTH.OUTSIDER, "select count(*) as n from work_items")).toBe(0);
    expect(await count(AUTH.OUTSIDER, "select count(*) as n from key_results")).toBe(0);
    expect(await count(AUTH.OUTSIDER, "select count(*) as n from evidence")).toBe(0);
    expect(await count(AUTH.OUTSIDER, "select count(*) as n from deliverables")).toBe(0);
  });

  it("assigned reviewer sees the work + its KR context, director sees department scope", async () => {
    expect(await count(AUTH.REVIEWER, "select count(*) as n from work_items")).toBe(5);
    expect(await count(AUTH.REVIEWER, "select count(*) as n from key_results")).toBeGreaterThan(0);
    expect(await count(AUTH.DIRECTOR, "select count(*) as n from work_items")).toBe(5);
    expect(await count(AUTH.DIRECTOR, "select count(*) as n from objectives")).toBe(3);
  });

  it("unrelated employee cannot write into someone else's work (IDOR)", async () => {
    const workId = await asUser(pool, AUTH.LA, async (c) =>
      (await c.query("select id from work_items limit 1")).rows[0].id as string);
    // insert evidence into a foreign work item → blocked
    await expectDbError(
      asUser(pool, AUTH.OUTSIDER, (c) =>
        c.query(
          `insert into evidence (work_item_id, evidence_type, title, description, created_by)
           values ($1, 'DOCUMENT', 'x', 'y', $2)`,
          [workId, "e0000000-0000-4000-8000-000000000099"])),
      /row-level security/);
    // update foreign work → 0 rows affected (invisible), not an error
    const updated = await asUser(pool, AUTH.OUTSIDER, async (c) =>
      (await c.query("update work_items set title = 'hacked' where id = $1", [workId])).rowCount);
    expect(updated).toBe(0);
  });

  it("evidence cannot be inserted pre-verified, and creator cannot verify own", async () => {
    const workId = await asUser(pool, AUTH.LA, async (c) =>
      (await c.query("select id from work_items where work_code='IPPDD-2026Q3-W002'")).rows[0].id as string);
    await expectDbError(
      asUser(pool, AUTH.LA, (c) =>
        c.query(
          `insert into evidence (work_item_id, evidence_type, title, description, created_by, verified, verified_by, verified_at)
           values ($1, 'DOCUMENT', 'x', 'y', $2, true, $2, now())`,
          [workId, EMP.LA])),
      /row-level security/);
    const evId = await asUser(pool, AUTH.LA, async (c) =>
      (await c.query(
        `insert into evidence (work_item_id, evidence_type, title, description, created_by)
         values ($1, 'DOCUMENT', 'ev', 'd', $2) returning id`,
        [workId, EMP.LA])).rows[0].id as string);
    await expectDbError(
      asUser(pool, AUTH.LA, (c) => c.query("select app.verify_evidence($1)", [evId])),
      /creator cannot verify own evidence/);
    // the assigned reviewer can
    await asUser(pool, AUTH.REVIEWER, (c) => c.query("select app.verify_evidence($1)", [evId]));
  });

  it("reviewer can decide only own pending reviews", async () => {
    const workId = await asUser(pool, AUTH.LA, async (c) => {
      const id = (await c.query("select id from work_items where work_code='IPPDD-2026Q3-W002'")).rows[0].id as string;
      await c.query(
        "insert into reviews (work_item_id, reviewer_id, review_type) values ($1, $2, 'FUNCTIONAL')",
        [id, EMP.REVIEWER]);
      return id;
    });
    // outsider (not the assigned reviewer) cannot flip the decision
    const flipped = await asUser(pool, AUTH.OUTSIDER, async (c) =>
      (await c.query(
        `update reviews set decision='PASS', reviewed_at=now()
         where work_item_id=$1 and decision='PENDING'`, [workId])).rowCount);
    expect(flipped).toBe(0);
    // even the owner cannot
    const flippedByOwner = await asUser(pool, AUTH.LA, async (c) =>
      (await c.query(
        `update reviews set decision='PASS', reviewed_at=now()
         where work_item_id=$1 and decision='PENDING'`, [workId])).rowCount);
    expect(flippedByOwner).toBe(0);
  });

  it("notifications are strictly recipient-scoped", async () => {
    await asUser(pool, AUTH.LA, (c) =>
      c.query("select app.notify($1, 'TEST', 'зөвхөн LA-д', null, null, null)", [EMP.LA]));
    expect(await count(AUTH.LA, "select count(*) as n from notifications where type='TEST'")).toBe(1);
    expect(await count(AUTH.OUTSIDER, "select count(*) as n from notifications where type='TEST'")).toBe(0);
  });

  it("gate configuration is read-all but admin-write", async () => {
    expect(await count(AUTH.OUTSIDER, "select count(*) as n from closure_profiles")).toBeGreaterThan(0);
    const changed = await asUser(pool, AUTH.OUTSIDER, async (c) =>
      (await c.query("update closure_profiles set requires_approval = false where work_type = 'POLICY'")).rowCount);
    expect(changed).toBe(0);
    const adminChanged = await asUser(pool, AUTH.ADMIN, async (c) =>
      (await c.query("update closure_profiles set min_evidence_count = 2 where work_type = 'POLICY'")).rowCount);
    expect(adminChanged).toBe(1);
  });

  it("audit visibility: actors and participants see relevant entries, outsiders do not", async () => {
    await asUser(pool, AUTH.LA, (c) =>
      c.query("select app.audit('work_item', (select id from work_items limit 1), 'TEST_AUDIT')"));
    expect(await count(AUTH.LA, "select count(*) as n from audit_logs where action='TEST_AUDIT'")).toBe(1);
    expect(await count(AUTH.OUTSIDER, "select count(*) as n from audit_logs where action='TEST_AUDIT'")).toBe(0);
    expect(await count(AUTH.DIRECTOR, "select count(*) as n from audit_logs where action='TEST_AUDIT'")).toBe(1);
  });

  it("direct API cannot bypass: employee cannot force quarter/KR closure functions", async () => {
    const krId = await asUser(pool, AUTH.LA, async (c) =>
      (await c.query("select id from key_results limit 1")).rows[0].id as string);
    const reqId = await asUser(pool, AUTH.LA, async (c) =>
      (await c.query(
        `insert into closure_requests (scope_type, scope_id, requested_by, status)
         values ('KEY_RESULT', $1, $2, 'READY_FOR_SIGNOFF') returning id`,
        [krId, EMP.LA])).rows[0].id as string);
    await expectDbError(
      asUser(pool, AUTH.LA, (c) =>
        c.query("select app.finalize_kr_closure($1, 'APPROVE', null, 100)", [reqId])),
      /owner cannot sign off|not authorized/);
    await expectDbError(
      asUser(pool, AUTH.OUTSIDER, (c) =>
        c.query("select app.finalize_kr_closure($1, 'APPROVE', null, 100)", [reqId])),
      /not found|not authorized/);
  });
});
