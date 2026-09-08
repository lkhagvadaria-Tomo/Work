import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  AUTH, EMP, appPool, asUser, expectDbError, resetTestDb,
} from "../helpers/db";

/**
 * Integration tests (§45): the governed lifecycle against a real PostgreSQL
 * with RLS enforced — create → submit → review → return → resubmit → approve →
 * closure gate → human sign-off → CLOSED; plus DB-level integrity rules.
 * Uses seeded pilot work item IPPDD-2026Q3-W002 (STANDARD, 3 requirements).
 */
let pool: Pool;
let workId: string;
let closureRequestId: string;

beforeAll(() => {
  resetTestDb();
  pool = appPool();
}, 120_000);

afterAll(async () => {
  await pool.end();
});

async function workStatus(): Promise<string> {
  return asUser(pool, AUTH.LA, async (c) => {
    const { rows } = await c.query("select status from work_items where id = $1", [workId]);
    return rows[0].status as string;
  });
}

describe("governed work lifecycle", () => {
  it("owner prepares W002: deliverables (final), evidence, self QC", async () => {
    await asUser(pool, AUTH.LA, async (c) => {
      const { rows } = await c.query(
        "select id from work_items where work_code = 'IPPDD-2026Q3-W002'");
      workId = rows[0].id as string;
      const { rows: reqs } = await c.query(
        "select id, name from deliverable_requirements where work_item_id = $1", [workId]);
      expect(reqs).toHaveLength(3);
      for (const r of reqs) {
        await c.query(
          `insert into deliverables (work_item_id, requirement_id, name, version, final_version, submitted_by)
           values ($1, $2, $3, 'v1.0', true, $4)`,
          [workId, r.id, `${r.name} v1.0`, EMP.LA]);
      }
      await c.query(
        `insert into evidence (work_item_id, evidence_type, title, description, created_by)
         values ($1, 'MEETING_DECISION', 'Хурлын тэмдэглэл', 'шийдвэр', $2)`,
        [workId, EMP.LA]);
      await c.query(
        `insert into reviews (work_item_id, reviewer_id, review_type, decision, reviewed_at)
         values ($1, $2, 'SELF_QC', 'PASS', now())`, [workId, EMP.LA]);
    });
  });

  it("rejects an invalid state jump (IN_PROGRESS → APPROVED)", async () => {
    await expectDbError(
      asUser(pool, AUTH.LA, (c) =>
        c.query("update work_items set status = 'APPROVED' where id = $1", [workId])),
      /invalid work transition/);
  });

  it("owner submits; reviewer RETURNs with mandatory comment; owner resubmits", async () => {
    await asUser(pool, AUTH.LA, async (c) => {
      await c.query("update work_items set status = 'SUBMITTED' where id = $1", [workId]);
      await c.query(
        `insert into reviews (work_item_id, reviewer_id, review_type) values ($1, $2, 'FUNCTIONAL')`,
        [workId, EMP.REVIEWER]);
    });
    // comment is mandatory for RETURN (DB check constraint)
    await expectDbError(
      asUser(pool, AUTH.REVIEWER, (c) =>
        c.query(
          `update reviews set decision = 'RETURN', reviewed_at = now()
           where work_item_id = $1 and decision = 'PENDING'`, [workId])),
      /violates check constraint/);
    await asUser(pool, AUTH.REVIEWER, async (c) => {
      await c.query("update work_items set status = 'UNDER_REVIEW' where id = $1", [workId]);
      await c.query(
        `update reviews set decision = 'RETURN', comment = 'RACI тодруул', reviewed_at = now()
         where work_item_id = $1 and decision = 'PENDING'`, [workId]);
      await c.query("update work_items set status = 'RETURNED' where id = $1", [workId]);
    });
    expect(await workStatus()).toBe("RETURNED");
    await asUser(pool, AUTH.LA, async (c) => {
      await c.query("update work_items set status = 'IN_PROGRESS' where id = $1", [workId]);
      await c.query("update work_items set status = 'SUBMITTED' where id = $1", [workId]);
      await c.query(
        `insert into reviews (work_item_id, reviewer_id, review_type) values ($1, $2, 'FUNCTIONAL')`,
        [workId, EMP.REVIEWER]);
    });
  });

  it("reviewer PASSes; owner requests approval; director approves", async () => {
    await asUser(pool, AUTH.REVIEWER, async (c) => {
      await c.query("update work_items set status = 'UNDER_REVIEW' where id = $1", [workId]);
      await c.query(
        `update reviews set decision = 'PASS', reviewed_at = now()
         where work_item_id = $1 and decision = 'PENDING'`, [workId]);
      await c.query("update work_items set status = 'REVIEW_PASSED' where id = $1", [workId]);
    });
    await asUser(pool, AUTH.LA, async (c) => {
      await c.query("update work_items set status = 'WAITING_APPROVAL' where id = $1", [workId]);
      await c.query(
        `insert into approvals (work_item_id, approver_id, approval_type, deliverable_version)
         values ($1, $2, 'DIRECTOR', 'v1.0')`, [workId, EMP.DIRECTOR]);
    });
    await asUser(pool, AUTH.DIRECTOR, async (c) => {
      await c.query(
        `update approvals set decision = 'APPROVE', approved_at = now()
         where work_item_id = $1 and decision = 'PENDING'`, [workId]);
      await c.query("update work_items set status = 'APPROVED' where id = $1", [workId]);
    });
    expect(await workStatus()).toBe("APPROVED");
  });

  it("segregation of duties: owner cannot be inserted as approver", async () => {
    await expectDbError(
      asUser(pool, AUTH.LA, (c) =>
        c.query(
          `insert into approvals (work_item_id, approver_id, approval_type)
           values ($1, $2, 'OTHER')`, [workId, EMP.LA])),
      /owner cannot approve own work|row-level security/);
  });

  it("employee cannot set CLOSED directly (any role, any path)", async () => {
    for (const uid of [AUTH.LA, AUTH.DIRECTOR, AUTH.ADMIN]) {
      await expectDbError(
        asUser(pool, uid, (c) =>
          c.query("update work_items set status = 'CLOSED', closed_at = now() where id = $1", [workId])),
        /closure gate \+ human sign-off/);
    }
  });

  it("closure: SQL re-check blocks a forged PASS gate run until conditions are real", async () => {
    // create a closure request pointing at a gate run the owner wrote directly
    closureRequestId = await asUser(pool, AUTH.LA, async (c) => {
      const { rows: gr } = await c.query(
        `insert into gate_runs (scope_type, scope_id, result, total_checks, passed_checks, run_by, completed_at)
         values ('WORK_ITEM', $1, 'PASS', 1, 1, $2, now()) returning id`,
        [workId, EMP.LA]);
      const { rows } = await c.query(
        `insert into closure_requests (scope_type, scope_id, requested_by, gate_run_id, status)
         values ('WORK_ITEM', $1, $2, $3, 'READY_FOR_SIGNOFF') returning id`,
        [workId, EMP.LA, gr[0].id as string]);
      return rows[0].id as string;
    });
    // blockers currently: none — W002 actually satisfies its profile. Remove the
    // evidence first to prove the SQL re-check catches a hollow "PASS".
    await asUser(pool, AUTH.LA, (c) =>
      c.query("delete from evidence where work_item_id = $1", [workId]));
    await expectDbError(
      asUser(pool, AUTH.DIRECTOR, (c) =>
        c.query("select app.finalize_work_closure($1, 'APPROVE', null)", [closureRequestId])),
      /closure blocked: .*EVIDENCE_INSUFFICIENT/);
    expect(await workStatus()).toBe("APPROVED");
  });

  it("owner cannot sign off own closure; the authorized director closes it", async () => {
    await asUser(pool, AUTH.LA, async (c) => {
      await c.query(
        `insert into evidence (work_item_id, evidence_type, title, description, created_by)
         values ($1, 'DOCUMENT', 'Эцсийн багц', 'нотолгоо', $2)`, [workId, EMP.LA]);
      // re-open the request after the failed attempt
      await c.query(
        "update closure_requests set status = 'READY_FOR_SIGNOFF' where id = $1", [closureRequestId]);
      // refresh the gate run so it is not stale relative to updated_at
      const { rows: gr } = await c.query(
        `insert into gate_runs (scope_type, scope_id, result, total_checks, passed_checks, run_by, completed_at)
         values ('WORK_ITEM', $1, 'PASS', 1, 1, $2, now()) returning id`, [workId, EMP.LA]);
      await c.query("update closure_requests set gate_run_id = $1 where id = $2",
        [gr[0].id as string, closureRequestId]);
    });
    await expectDbError(
      asUser(pool, AUTH.LA, (c) =>
        c.query("select app.finalize_work_closure($1, 'APPROVE', null)", [closureRequestId])),
      /owner cannot sign off/);
    await asUser(pool, AUTH.DIRECTOR, (c) =>
      c.query("select app.finalize_work_closure($1, 'APPROVE', 'бүрэн хангагдсан')", [closureRequestId]));
    expect(await workStatus()).toBe("CLOSED");
    // closed_at consistency (impossible-state prevention)
    await asUser(pool, AUTH.LA, async (c) => {
      const { rows } = await c.query(
        "select closed_at from work_items where id = $1", [workId]);
      expect(rows[0].closed_at).not.toBeNull();
    });
  });

  it("audit log is append-only", async () => {
    await expectDbError(
      asUser(pool, AUTH.ADMIN, (c) => c.query("delete from audit_logs")),
      /append-only|row-level security|permission denied/);
    await expectDbError(
      asUser(pool, AUTH.ADMIN, (c) => c.query("update audit_logs set action = 'X'")),
      /append-only|row-level security|permission denied/);
  });

  it("duplicate pending approval for the same stage is rejected", async () => {
    await asUser(pool, AUTH.LA, async (c) => {
      const { rows } = await c.query(
        "select id from work_items where work_code = 'IPPDD-2026Q3-W001'");
      const w1 = rows[0].id as string;
      await c.query(
        `insert into approvals (work_item_id, approver_id, approval_type)
         values ($1, $2, 'DIRECTOR')`, [w1, EMP.DIRECTOR]);
      await expect(
        c.query(
          `insert into approvals (work_item_id, approver_id, approval_type)
           values ($1, $2, 'DIRECTOR')`, [w1, EMP.DIRECTOR]),
      ).rejects.toThrow(/duplicate key/);
    });
  });
});
