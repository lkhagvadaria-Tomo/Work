"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { withUser, type Queryable } from "@/lib/db";
import { canTransition } from "@/lib/workflow/state-machine";
import { evaluateWorkClosure } from "@/lib/gate-engine/engine";
import { loadWorkSnapshot, persistGateRun } from "@/lib/gate-engine/load";
import type { WorkItem, WorkStatus } from "@/types/db";

/**
 * Work lifecycle server actions. Authorization is enforced by RLS inside every
 * transaction (lib/db withUser) — these actions add workflow semantics, audit
 * entries and notifications on top, never a substitute for DB-side checks.
 */

function fail(msg: string): never {
  redirect(`/error?m=${encodeURIComponent(msg)}`);
}

async function getWork(tx: Queryable, id: string): Promise<WorkItem> {
  const { rows } = await tx.query<WorkItem>("select * from work_items where id = $1", [id]);
  if (rows.length === 0) throw new Error("Ажил олдсонгүй эсвэл хандах эрхгүй");
  return rows[0];
}

async function transition(
  tx: Queryable,
  work: WorkItem,
  to: WorkStatus,
  action: string,
): Promise<void> {
  if (!canTransition(work.status, to)) {
    throw new Error(`Төлөвийн шилжилт боломжгүй: ${work.status} → ${to}`);
  }
  await tx.query("update work_items set status = $1 where id = $2", [to, work.id]);
  await tx.query("select app.audit('work_item', $1, $2, $3, $4)", [
    work.id, action,
    JSON.stringify({ status: work.status }),
    JSON.stringify({ status: to }),
  ]);
}

const createSchema = z.object({
  title: z.string().min(3).max(300),
  work_type: z.string().min(2),
  key_result_id: z.string().uuid().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  definition_of_done: z.string().max(4000).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  reviewer_id: z.string().uuid().optional().or(z.literal("")),
  approver_id: z.string().uuid().optional().or(z.literal("")),
  implementation_required: z.coerce.boolean().default(false),
  validation_required: z.coerce.boolean().default(false),
});

export async function createWorkItem(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    work_type: formData.get("work_type"),
    key_result_id: (formData.get("key_result_id") as string) || null,
    priority: formData.get("priority") || "MEDIUM",
    definition_of_done: formData.get("definition_of_done") || undefined,
    deadline: formData.get("deadline") || "",
    reviewer_id: formData.get("reviewer_id") || "",
    approver_id: formData.get("approver_id") || "",
    implementation_required: formData.get("implementation_required") === "on",
    validation_required: formData.get("validation_required") === "on",
  });
  if (!parsed.success) fail("Талбар буруу: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  const d = parsed.data;
  if (d.approver_id && d.approver_id === session.employee.id) {
    fail("Эрх мэдлийн тусгаарлалт: та өөрийн ажлын батлагч байж болохгүй");
  }

  let newId = "";
  try {
    newId = await withUser(session.authUid, async (tx) => {
      const { rows: seq } = await tx.query<{ n: string }>(
        "select count(*) + 1 as n from work_items where quarter_id = (select id from quarters where status = 'ACTIVE' order by start_date desc limit 1)",
      );
      const { rows } = await tx.query<{ id: string; work_code: string }>(
        `insert into work_items (key_result_id, owner_id, department_id, quarter_id, work_code,
           title, work_type, priority, definition_of_done, deadline, status,
           reviewer_id, approver_id, implementation_required, validation_required, created_by)
         select $1, $2, e.department_id,
                (select id from quarters where status = 'ACTIVE' order by start_date desc limit 1),
                'IPPDD-' || (select code from quarters where status='ACTIVE' order by start_date desc limit 1)
                  || '-W' || lpad($3, 3, '0'),
                $4, $5::work_type, $6::work_priority, $7, nullif($8,'')::date, 'NOT_STARTED',
                nullif($9,'')::uuid, nullif($10,'')::uuid, $11, $12, $2
         from employees e where e.id = $2
         returning id, work_code`,
        [
          d.key_result_id, session.employee.id, seq[0].n, d.title, d.work_type,
          d.priority, d.definition_of_done ?? null, d.deadline ?? "",
          d.reviewer_id ?? "", d.approver_id ?? "",
          d.implementation_required, d.validation_required,
        ],
      );
      await tx.query("select app.audit('work_item', $1, 'CREATE', null, $2)", [
        rows[0].id, JSON.stringify({ work_code: rows[0].work_code, title: d.title }),
      ]);
      return rows[0].id;
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Ажил үүсгэж чадсангүй");
  }
  revalidatePath("/work");
  redirect(`/work/${newId}`);
}

export async function startWork(workId: string): Promise<void> {
  const session = await requireSession();
  await withUser(session.authUid, async (tx) => {
    const w = await getWork(tx, workId);
    await transition(tx, w, "IN_PROGRESS", "START");
  });
  revalidatePath(`/work/${workId}`);
}

export async function submitForReview(workId: string): Promise<void> {
  const session = await requireSession();
  try {
    await withUser(session.authUid, async (tx) => {
      const w = await getWork(tx, workId);
      if (w.owner_id !== session.employee.id) throw new Error("Зөвхөн эзэмшигч илгээнэ");
      if (!w.reviewer_id) throw new Error("Хянагч томилогдоогүй байна");
      await transition(tx, w, "SUBMITTED", "SUBMIT_FOR_REVIEW");
      // open the required functional review for the assigned reviewer
      await tx.query(
        `insert into reviews (work_item_id, reviewer_id, review_type, deliverable_version)
         select $1, $2, 'FUNCTIONAL',
                (select version from deliverables where work_item_id = $1 order by updated_at desc limit 1)
         on conflict do nothing`,
        [workId, w.reviewer_id],
      );
      await tx.query("select app.notify($1, 'REVIEW_REQUESTED', $2, $3, 'work_item', $4)", [
        w.reviewer_id, "Хянах хүсэлт", `${w.work_code} — ${w.title}`, workId,
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Илгээж чадсангүй");
  }
  revalidatePath(`/work/${workId}`);
  revalidatePath("/reviews");
}

export async function resubmit(workId: string): Promise<void> {
  const session = await requireSession();
  await withUser(session.authUid, async (tx) => {
    const w = await getWork(tx, workId);
    await transition(tx, w, "IN_PROGRESS", "RESUBMIT");
  });
  revalidatePath(`/work/${workId}`);
}

export async function recordSelfQc(workId: string): Promise<void> {
  const session = await requireSession();
  try {
    await withUser(session.authUid, async (tx) => {
      const w = await getWork(tx, workId);
      if (w.owner_id !== session.employee.id) throw new Error("Self QC-г зөвхөн эзэмшигч бүртгэнэ");
      await tx.query(
        `insert into reviews (work_item_id, reviewer_id, review_type, decision, reviewed_at, comment)
         values ($1, $2, 'SELF_QC', 'PASS', now(), 'Өөрийн чанарын шалгалт хийгдсэн')`,
        [workId, session.employee.id],
      );
      await tx.query("select app.audit('work_item', $1, 'SELF_QC_PASS')", [workId]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Self QC бүртгэж чадсангүй");
  }
  revalidatePath(`/work/${workId}`);
}

const decisionSchema = z.object({
  decision: z.enum(["PASS", "RETURN", "REJECT"]),
  comment: z.string().max(4000).optional().or(z.literal("")),
});

export async function decideReview(reviewId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = decisionSchema.safeParse({
    decision: formData.get("decision"),
    comment: formData.get("comment") || "",
  });
  if (!parsed.success) fail("Шийдвэр буруу");
  const { decision, comment } = parsed.data;
  if ((decision === "RETURN" || decision === "REJECT") && !comment?.trim()) {
    fail("RETURN/REJECT шийдвэрт тайлбар заавал");
  }
  let workId = "";
  try {
    workId = await withUser(session.authUid, async (tx) => {
      const { rows } = await tx.query<{ work_item_id: string; review_type: string }>(
        "select work_item_id, review_type from reviews where id = $1 and decision = 'PENDING'",
        [reviewId],
      );
      if (rows.length === 0) throw new Error("Хүлээгдэж буй review олдсонгүй");
      const w = await getWork(tx, rows[0].work_item_id);
      if (w.status === "SUBMITTED") {
        await transition(tx, w, "UNDER_REVIEW", "REVIEW_START");
        w.status = "UNDER_REVIEW";
      }
      await tx.query(
        "update reviews set decision = $1::review_decision, comment = nullif($2,''), reviewed_at = now() where id = $3",
        [decision, comment ?? "", reviewId],
      );
      await tx.query("select app.audit('work_item', $1, $2, null, $3)", [
        w.id, `REVIEW_${decision}`, JSON.stringify({ review_id: reviewId, comment }),
      ]);
      if (decision === "PASS") {
        // all required (non-self) reviews passed?
        const { rows: open } = await tx.query<{ n: string }>(
          `select count(*) as n from reviews
            where work_item_id = $1 and review_type <> 'SELF_QC' and decision = 'PENDING'`,
          [w.id],
        );
        if (Number(open[0].n) === 0) {
          await transition(tx, w, "REVIEW_PASSED", "ALL_REVIEWS_PASSED");
        }
        await tx.query("select app.notify($1, 'REVIEW_PASSED', $2, $3, 'work_item', $4)", [
          w.owner_id, "Review PASS", `${w.work_code}`, w.id,
        ]);
      } else {
        await transition(tx, w, decision === "RETURN" ? "RETURNED" : "REJECTED", `REVIEW_${decision}`);
        await tx.query("select app.notify($1, $2, $3, $4, 'work_item', $5)", [
          w.owner_id, `WORK_${decision}ED`, decision === "RETURN" ? "Ажил буцаагдлаа" : "Ажил татгалзагдлаа",
          comment ?? "", w.id,
        ]);
      }
      return w.id;
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Шийдвэр бүртгэж чадсангүй");
  }
  revalidatePath(`/work/${workId}`);
  revalidatePath("/reviews");
}

export async function requestApproval(workId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const approvalType = (formData.get("approval_type") as string) || "DIRECTOR";
  try {
    await withUser(session.authUid, async (tx) => {
      const w = await getWork(tx, workId);
      if (!w.approver_id) throw new Error("Батлагч томилогдоогүй байна");
      await transition(tx, w, "WAITING_APPROVAL", "REQUEST_APPROVAL");
      await tx.query(
        `insert into approvals (work_item_id, approver_id, approval_type, deliverable_version)
         values ($1, $2, $3::approval_type,
                 (select version from deliverables
                   where work_item_id = $1 and final_version
                   order by updated_at desc limit 1))`,
        [workId, w.approver_id, approvalType],
      );
      await tx.query("select app.notify($1, 'APPROVAL_REQUESTED', $2, $3, 'work_item', $4)", [
        w.approver_id, "Батлах хүсэлт", `${w.work_code} — ${w.title}`, workId,
      ]);
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Батлах хүсэлт илгээж чадсангүй");
  }
  revalidatePath(`/work/${workId}`);
  revalidatePath("/approvals");
}

export async function decideApproval(approvalId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const decision = formData.get("decision") as string;
  const comment = ((formData.get("comment") as string) || "").trim();
  if (!["APPROVE", "RETURN", "REJECT"].includes(decision)) fail("Шийдвэр буруу");
  if (decision !== "APPROVE" && !comment) fail("RETURN/REJECT шийдвэрт тайлбар заавал");

  let workId = "";
  try {
    workId = await withUser(session.authUid, async (tx) => {
      const { rows } = await tx.query<{ work_item_id: string }>(
        "select work_item_id from approvals where id = $1 and decision = 'PENDING' and approver_id = $2",
        [approvalId, session.employee.id],
      );
      if (rows.length === 0) throw new Error("Хүлээгдэж буй батлал олдсонгүй");
      const w = await getWork(tx, rows[0].work_item_id);
      await tx.query(
        `update approvals set decision = $1::approval_decision, comment = nullif($2,''),
           approved_at = case when $1 = 'APPROVE' then now() end
         where id = $3`,
        [decision, comment, approvalId],
      );
      await tx.query("select app.audit('work_item', $1, $2, null, $3)", [
        w.id, `APPROVAL_${decision}`, JSON.stringify({ approval_id: approvalId, comment }),
      ]);
      if (decision === "APPROVE") {
        await transition(tx, w, "APPROVED", "APPROVED");
        // snapshot Drive metadata of final deliverables at approval time (D-008)
        await tx.query(
          `update deliverables set approved_modified_time = drive_modified_time,
             status = 'APPROVED'
           where work_item_id = $1 and final_version`,
          [w.id],
        );
        // route to implementation/validation when the work requires it
        if (w.implementation_required) {
          await transition(tx, { ...w, status: "APPROVED" }, "IMPLEMENTATION", "TO_IMPLEMENTATION");
        } else if (w.validation_required) {
          await transition(tx, { ...w, status: "APPROVED" }, "VALIDATION", "TO_VALIDATION");
        }
        await tx.query("select app.notify($1, 'APPROVED', $2, $3, 'work_item', $4)", [
          w.owner_id, "Батлагдлаа", `${w.work_code}`, w.id,
        ]);
      } else {
        await transition(tx, w, decision === "RETURN" ? "RETURNED" : "REJECTED", `APPROVAL_${decision}`);
        await tx.query("select app.notify($1, $2, $3, $4, 'work_item', $5)", [
          w.owner_id, `APPROVAL_${decision}`,
          decision === "RETURN" ? "Батлалаас буцаагдлаа" : "Батлалаас татгалзагдлаа",
          comment, w.id,
        ]);
      }
      return w.id;
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Батлалын шийдвэр бүртгэж чадсангүй");
  }
  revalidatePath(`/work/${workId}`);
  revalidatePath("/approvals");
}

export async function recordImplementation(workId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const status = formData.get("implementation_status") as string;
  const environment = ((formData.get("environment") as string) || "").trim();
  const comment = ((formData.get("comment") as string) || "").trim();
  if (!["NOT_REQUIRED", "NOT_STARTED", "IN_PROGRESS", "PILOT", "LIVE", "FAILED", "ROLLED_BACK"].includes(status)) {
    fail("Хэрэгжилтийн төлөв буруу");
  }
  try {
    await withUser(session.authUid, async (tx) => {
      const w = await getWork(tx, workId);
      await tx.query(
        `insert into implementation_records
           (work_item_id, implementation_status, environment, comment, implemented_by, implemented_at)
         values ($1, $2::implementation_status, nullif($3,''), nullif($4,''), $5,
                 case when $2 in ('LIVE','PILOT') then now() end)`,
        [workId, status, environment, comment, session.employee.id],
      );
      await tx.query("select app.audit('work_item', $1, 'IMPLEMENTATION_RECORD', null, $2)", [
        workId, JSON.stringify({ status, environment }),
      ]);
      if ((status === "LIVE" || status === "PILOT") && w.status === "IMPLEMENTATION") {
        await transition(tx, w, "VALIDATION", "TO_VALIDATION");
      }
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Хэрэгжилт бүртгэж чадсангүй");
  }
  revalidatePath(`/work/${workId}`);
}

export async function recordMetricActual(metricId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const actual = Number(formData.get("actual_value"));
  if (!Number.isFinite(actual)) fail("Бодит утга буруу");
  let workId: string | null = null;
  try {
    workId = await withUser(session.authUid, async (tx) => {
      const { rows } = await tx.query<{ work_item_id: string | null }>(
        "update metric_validations set actual_value = $1 where id = $2 returning work_item_id",
        [actual, metricId],
      );
      if (rows.length === 0) throw new Error("Метрик олдсонгүй");
      await tx.query("select app.audit('metric_validation', $1, 'ACTUAL_RECORDED', null, $2)", [
        metricId, JSON.stringify({ actual }),
      ]);
      return rows[0].work_item_id;
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Метрик бүртгэж чадсангүй");
  }
  if (workId) revalidatePath(`/work/${workId}`);
}

export async function validateMetric(metricId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const status = formData.get("validation_status") as string;
  if (!["PASS", "FAIL", "NOT_APPLICABLE"].includes(status)) fail("Төлөв буруу");
  let workId: string | null = null;
  try {
    workId = await withUser(session.authUid, async (tx) => {
      const { rows } = await tx.query<{ work_item_id: string | null; metric_name: string }>(
        `update metric_validations
           set validation_status = $1::validation_status, validated_by = $2, validated_at = now()
         where id = $3 returning work_item_id, metric_name`,
        [status, session.employee.id, metricId],
      );
      if (rows.length === 0) throw new Error("Метрик олдсонгүй эсвэл эрхгүй");
      await tx.query("select app.audit('metric_validation', $1, $2)", [
        metricId, `METRIC_${status}`,
      ]);
      return rows[0].work_item_id;
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Баталгаажуулж чадсангүй");
  }
  if (workId) revalidatePath(`/work/${workId}`);
}

/**
 * SUBMIT FOR CLOSURE (§3): deterministic gate run + closure request. The
 * employee never sets CLOSED — sign-off happens in finalizeWorkClosure.
 */
export async function submitForClosure(workId: string): Promise<void> {
  const session = await requireSession();
  try {
    await withUser(session.authUid, async (tx) => {
      const snapshot = await loadWorkSnapshot(tx, workId);
      if (!snapshot) throw new Error("Ажил олдсонгүй");
      const evaluation = evaluateWorkClosure(snapshot);
      const runId = await persistGateRun(tx, {
        scopeType: "WORK_ITEM", scopeId: workId,
        runBy: session.employee.id, evaluation,
      });
      const status = evaluation.result === "FAIL" ? "GATE_FAILED" : "READY_FOR_SIGNOFF";
      // reuse an open request if one exists, else create
      const { rows: existing } = await tx.query<{ id: string }>(
        `select id from closure_requests
          where scope_type = 'WORK_ITEM' and scope_id = $1
            and status in ('PENDING','READY_FOR_SIGNOFF')`,
        [workId],
      );
      if (existing.length > 0) {
        await tx.query(
          "update closure_requests set gate_run_id = $1, status = $2::closure_status where id = $3",
          [runId, status === "GATE_FAILED" ? "PENDING" : status, existing[0].id],
        );
      } else {
        await tx.query(
          `insert into closure_requests (scope_type, scope_id, requested_by, gate_run_id, status)
           values ('WORK_ITEM', $1, $2, $3, $4::closure_status)`,
          [workId, session.employee.id, runId, status === "GATE_FAILED" ? "PENDING" : status],
        );
      }
      await tx.query("select app.audit('work_item', $1, 'SUBMIT_FOR_CLOSURE', null, $2)", [
        workId, JSON.stringify({ gate_result: evaluation.result, gate_run_id: runId }),
      ]);
      if (status === "READY_FOR_SIGNOFF") {
        const w = snapshot.work;
        if (w.approver_id) {
          await tx.query("select app.notify($1, 'CLOSURE_SIGNOFF', $2, $3, 'work_item', $4)", [
            w.approver_id, "Хаалтын sign-off хүлээгдэж байна",
            `${w.work_code} — gate: ${evaluation.result}`, workId,
          ]);
        }
      }
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Хаалтын хүсэлт илгээж чадсангүй");
  }
  revalidatePath(`/work/${workId}`);
  revalidatePath("/approvals");
}

export async function finalizeWorkClosure(requestId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const decision = formData.get("decision") as string;
  const comment = ((formData.get("comment") as string) || "").trim();
  if (!["APPROVE", "RETURN", "REJECT"].includes(decision)) fail("Шийдвэр буруу");
  try {
    await withUser(session.authUid, async (tx) => {
      await tx.query(
        "select app.finalize_work_closure($1, $2::approval_decision, nullif($3,''))",
        [requestId, decision, comment],
      );
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : "Хаалтыг баталж чадсангүй");
  }
  revalidatePath("/work");
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}
