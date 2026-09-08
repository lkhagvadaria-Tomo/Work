import "server-only";
import type { Queryable } from "@/lib/db";
import type {
  Approval, ClosureProfile, Deliverable, DeliverableRequirement,
  ImplementationRecord, MetricValidation, Review, WorkItem,
} from "@/types/db";
import type { GateEvaluation, WorkSnapshot } from "./types";

export function pgEnumArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") {
    return v.replace(/^\{|\}$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

const DEFAULT_PROFILE: Omit<ClosureProfile, "id" | "work_type"> = {
  requires_deliverables: true,
  requires_self_qc: true,
  required_review_types: ["FUNCTIONAL"],
  requires_approval: true,
  required_approval_types: ["DIRECTOR"],
  requires_implementation: false,
  requires_validation: false,
  requires_metric: false,
  requires_evidence: true,
  min_evidence_count: 1,
  simplified_closure: false,
  notes: null,
};

/** Load everything the Gate Engine needs about a work item (RLS applies). */
export async function loadWorkSnapshot(
  tx: Queryable,
  workItemId: string,
): Promise<WorkSnapshot | null> {
  const { rows: workRows } = await tx.query<WorkItem>(
    "select * from work_items where id = $1",
    [workItemId],
  );
  if (workRows.length === 0) return null;
  const work = workRows[0];

  // one client per transaction → queries run sequentially
  const profileR = await tx.query<ClosureProfile>(
    "select * from closure_profiles where work_type = $1",
    [work.work_type],
  );
  const reqR = await tx.query<DeliverableRequirement>(
    "select * from deliverable_requirements where work_item_id = $1 order by sequence",
    [workItemId],
  );
  const delR = await tx.query<Deliverable>(
    "select * from deliverables where work_item_id = $1",
    [workItemId],
  );
  const revR = await tx.query<Review>("select * from reviews where work_item_id = $1", [workItemId]);
  const appR = await tx.query<Approval>("select * from approvals where work_item_id = $1", [workItemId]);
  const implR = await tx.query<ImplementationRecord>(
    "select * from implementation_records where work_item_id = $1",
    [workItemId],
  );
  const metR = await tx.query<MetricValidation>(
    "select * from metric_validations where work_item_id = $1",
    [workItemId],
  );
  const evR = await tx.query<{ id: string; verified: boolean }>(
    "select id, verified from evidence where work_item_id = $1",
    [workItemId],
  );
  const findR = await tx.query<{ n: string }>(
    `select count(*) as n from gate_findings f
      join gate_runs g on g.id = f.gate_run_id
     where g.scope_type = 'WORK_ITEM' and g.scope_id = $1
       and f.severity = 'CRITICAL' and f.result = 'FAIL' and not f.resolved
       and g.id = (select id from gate_runs
                   where scope_type = 'WORK_ITEM' and scope_id = $1
                   order by started_at desc limit 1)`,
    [workItemId],
  );

  const rawProfile =
    profileR.rows[0] ??
    ({ id: "default", work_type: work.work_type, ...DEFAULT_PROFILE } as ClosureProfile);
  // pg returns enum[] columns as "{A,B}" strings (no parser for custom array OIDs)
  const profile: ClosureProfile = {
    ...rawProfile,
    required_review_types: pgEnumArray(rawProfile.required_review_types) as ClosureProfile["required_review_types"],
    required_approval_types: pgEnumArray(rawProfile.required_approval_types) as ClosureProfile["required_approval_types"],
  };

  return {
    work,
    profile,
    requirements: reqR.rows,
    deliverables: delR.rows,
    reviews: revR.rows,
    approvals: appR.rows,
    implementations: implR.rows,
    metrics: metR.rows,
    evidence: evR.rows,
    openCriticalFindings: Number(findR.rows[0]?.n ?? 0),
    today: new Date().toISOString().slice(0, 10),
  };
}

/** Persist a gate evaluation as an immutable gate_run + findings. Returns run id. */
export async function persistGateRun(
  tx: Queryable,
  args: {
    scopeType: "WORK_ITEM" | "KEY_RESULT" | "QUARTER";
    scopeId: string;
    runBy: string;
    evaluation: GateEvaluation;
    gateType?: string;
  },
): Promise<string> {
  const { evaluation: ev } = args;
  const { rows } = await tx.query<{ id: string }>(
    `insert into gate_runs (scope_type, scope_id, gate_type, result, total_checks,
       passed_checks, warning_checks, failed_checks, run_by, run_source, completed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'USER', now())
     returning id`,
    [
      args.scopeType, args.scopeId, args.gateType ?? "CLOSURE", ev.result,
      ev.totals.total, ev.totals.passed, ev.totals.warnings, ev.totals.failed, args.runBy,
    ],
  );
  const runId = rows[0].id;
  for (const f of ev.findings) {
    await tx.query(
      `insert into gate_findings (gate_run_id, severity, result, title,
         description, recommended_action, related_entity_type, related_entity_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        runId,
        f.severity, f.result, f.title, f.description ?? null,
        f.recommendedAction ?? null, f.relatedEntityType ?? null, f.relatedEntityId ?? null,
      ],
    );
  }
  return runId;
}
