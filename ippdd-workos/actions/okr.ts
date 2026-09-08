"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withUser, type Queryable } from "@/lib/db";
import { evaluateKrClosure } from "@/lib/gate-engine/kr";
import { evaluateQuarterClosure } from "@/lib/gate-engine/quarter";
import { persistGateRun } from "@/lib/gate-engine/load";
import type { KeyResult, MetricValidation, WorkItem } from "@/types/db";

function fail(msg: string): never {
  redirect(`/error?m=${encodeURIComponent(msg)}`);
}

async function loadKrSnapshot(tx: Queryable, krId: string) {
  const { rows: krRows } = await tx.query<KeyResult>(
    "select * from key_results where id = $1", [krId],
  );
  if (krRows.length === 0) return null;
  const [work, metrics] = await Promise.all([
    tx.query<Pick<WorkItem, "id" | "work_code" | "status" | "title">>(
      "select id, work_code, status, title from work_items where key_result_id = $1", [krId],
    ),
    tx.query<MetricValidation>(
      "select * from metric_validations where key_result_id = $1", [krId],
    ),
  ]);
  return {
    kr: krRows[0],
    workItems: work.rows,
    metrics: metrics.rows,
    today: new Date().toISOString().slice(0, 10),
  };
}

/** SUBMIT KR FOR CLOSURE: gate run + closure request (director signs off). */
export async function submitKrForClosure(krId: string): Promise<void> {
  const session = await requireSession();
  try {
    await withUser(session.authUid, async (tx) => {
      const snapshot = await loadKrSnapshot(tx, krId);
      if (!snapshot) throw new Error("KR олдсонгүй");
      const evaluation = evaluateKrClosure(snapshot);
      const runId = await persistGateRun(tx, {
        scopeType: "KEY_RESULT", scopeId: krId,
        runBy: session.employee.id, evaluation,
      });
      const status = evaluation.result === "FAIL" ? "PENDING" : "READY_FOR_SIGNOFF";
      const { rows: existing } = await tx.query<{ id: string }>(
        `select id from closure_requests where scope_type='KEY_RESULT' and scope_id=$1
          and status in ('PENDING','READY_FOR_SIGNOFF')`, [krId],
      );
      if (existing.length > 0) {
        await tx.query(
          "update closure_requests set gate_run_id=$1, status=$2::closure_status where id=$3",
          [runId, status, existing[0].id],
        );
      } else {
        await tx.query(
          `insert into closure_requests (scope_type, scope_id, requested_by, gate_run_id, status)
           values ('KEY_RESULT', $1, $2, $3, $4::closure_status)`,
          [krId, session.employee.id, runId, status],
        );
      }
      await tx.query("select app.audit('key_result', $1, 'SUBMIT_FOR_CLOSURE', null, $2)", [
        krId, JSON.stringify({ gate_result: evaluation.result }),
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "KR хаалтын хүсэлт илгээж чадсангүй");
  }
  revalidatePath(`/okr/kr/${krId}`);
  revalidatePath("/approvals");
}

export async function finalizeKrClosure(requestId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const decision = formData.get("decision") as string;
  const comment = ((formData.get("comment") as string) || "").trim();
  const achievementRaw = formData.get("achievement_percent") as string | null;
  const achievement = achievementRaw ? Number(achievementRaw) : null;
  if (!["APPROVE", "RETURN", "REJECT"].includes(decision)) fail("Шийдвэр буруу");
  if (achievement != null && (!Number.isFinite(achievement) || achievement < 0 || achievement > 100)) {
    fail("Гүйцэтгэлийн хувь 0–100 байна");
  }
  try {
    await withUser(session.authUid, async (tx) => {
      await tx.query(
        "select app.finalize_kr_closure($1, $2::approval_decision, nullif($3,''), $4)",
        [requestId, decision, comment, achievement],
      );
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "KR хаалт баталж чадсангүй");
  }
  revalidatePath("/okr");
  revalidatePath("/approvals");
}

export async function setKrAchievement(krId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const value = Number(formData.get("achievement_percent"));
  if (!Number.isFinite(value) || value < 0 || value > 100) fail("Гүйцэтгэлийн хувь 0–100 байна");
  try {
    await withUser(session.authUid, async (tx) => {
      const { rowCount } = await tx.query(
        "update key_results set achievement_percent = $1 where id = $2",
        [value, krId],
      );
      if (!rowCount) throw new Error("KR олдсонгүй эсвэл эрхгүй");
      await tx.query("select app.audit('key_result', $1, 'ACHIEVEMENT_SET', null, $2)", [
        krId, JSON.stringify({ achievement_percent: value }),
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Гүйцэтгэл бүртгэж чадсангүй");
  }
  revalidatePath(`/okr/kr/${krId}`);
  revalidatePath("/okr");
}

/** REQUEST QUARTER CLOSURE for the current employee (§32). */
export async function submitQuarterForClosure(quarterId: string): Promise<void> {
  const session = await requireSession();
  try {
    await withUser(session.authUid, async (tx) => {
      const { rows: objectives } = await tx.query<{
        objective_code: string; title: string; weight: string; id: string;
      }>(
        `select id, objective_code, title, weight from objectives
          where quarter_id = $1 and employee_id = $2 and status <> 'CANCELLED'
          order by objective_code`,
        [quarterId, session.employee.id],
      );
      if (objectives.length === 0) throw new Error("Энэ улиралд таны OKR бүртгэлгүй");
      const withKrs = [];
      for (const o of objectives) {
        const { rows: krs } = await tx.query<{
          id: string; kr_code: string; title: string; weight: string;
          status: KeyResult["status"]; achievement_percent: string | null; deadline: string | null;
        }>(
          `select id, kr_code, title, weight, status, achievement_percent, deadline
             from key_results where objective_id = $1 order by kr_code`,
          [o.id],
        );
        withKrs.push({ ...o, krs });
      }
      const { rows: openWork } = await tx.query<{ work_code: string }>(
        `select work_code from work_items
          where quarter_id = $1 and owner_id = $2
            and status not in ('CLOSED','CANCELLED')`,
        [quarterId, session.employee.id],
      );
      const { rows: evStat } = await tx.query<{ pct: string }>(
        `select coalesce(round(100.0 * count(*) filter (where ev > 0) / greatest(count(*),1), 2), 100) as pct
           from (select w.id, (select count(*) from evidence e where e.work_item_id = w.id) as ev
                   from work_items w
                  where w.quarter_id = $1 and w.owner_id = $2 and w.status <> 'CANCELLED') t`,
        [quarterId, session.employee.id],
      );
      const evaluation = evaluateQuarterClosure({
        objectives: withKrs,
        evidenceCompleteness: Number(evStat[0]?.pct ?? 100),
        openWorkCodes: openWork.map((w) => w.work_code),
        today: new Date().toISOString().slice(0, 10),
      });
      const runId = await persistGateRun(tx, {
        scopeType: "QUARTER", scopeId: quarterId,
        runBy: session.employee.id, evaluation, gateType: "QUARTER_CLOSURE",
      });
      const status = evaluation.result === "FAIL" ? "PENDING" : "READY_FOR_SIGNOFF";
      const { rows: existing } = await tx.query<{ id: string }>(
        `select id from closure_requests where scope_type='QUARTER' and scope_id=$1
          and requested_by = $2 and status in ('PENDING','READY_FOR_SIGNOFF')`,
        [quarterId, session.employee.id],
      );
      if (existing.length > 0) {
        await tx.query(
          "update closure_requests set gate_run_id=$1, status=$2::closure_status where id=$3",
          [runId, status, existing[0].id],
        );
      } else {
        await tx.query(
          `insert into closure_requests (scope_type, scope_id, requested_by, gate_run_id, status)
           values ('QUARTER', $1, $2, $3, $4::closure_status)`,
          [quarterId, session.employee.id, runId, status],
        );
      }
      await tx.query("select app.audit('quarter', $1, 'QUARTER_CLOSURE_REQUEST', null, $2)", [
        quarterId, JSON.stringify({ gate_result: evaluation.result }),
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Улирлын хаалтын хүсэлт илгээж чадсангүй");
  }
  revalidatePath("/okr");
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}

export async function finalizeQuarterClosure(requestId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const decision = formData.get("decision") as string;
  const comment = ((formData.get("comment") as string) || "").trim();
  if (!["APPROVE", "RETURN", "REJECT"].includes(decision)) fail("Шийдвэр буруу");
  try {
    await withUser(session.authUid, async (tx) => {
      await tx.query(
        "select app.finalize_quarter_closure($1, $2::approval_decision, nullif($3,''))",
        [requestId, decision, comment],
      );
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Улирлын хаалт баталж чадсангүй");
  }
  revalidatePath("/approvals");
  revalidatePath("/reports");
}
