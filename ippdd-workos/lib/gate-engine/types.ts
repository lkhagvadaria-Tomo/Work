import type {
  Approval, ClosureProfile, Deliverable, DeliverableRequirement, Evidence,
  FindingSeverity, GateResult, ImplementationRecord, KeyResult,
  MetricValidation, Review, WorkItem,
} from "@/types/db";

/** One engine check, keyed by rule_type (matches gate_rules.rule_type). */
export interface GateCheck {
  key: string;
  gate: "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "W";
  result: GateResult;
  required: boolean;
}

export interface EngineFinding {
  severity: FindingSeverity;
  result: GateResult;
  title: string;
  description?: string;
  recommendedAction?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface GateEvaluation {
  result: GateResult;
  checks: GateCheck[];
  findings: EngineFinding[];
  totals: { total: number; passed: number; warnings: number; failed: number };
}

/** Everything the engine needs about one work item — no I/O inside the engine. */
export interface WorkSnapshot {
  work: WorkItem;
  profile: ClosureProfile;
  requirements: DeliverableRequirement[];
  deliverables: Deliverable[];
  reviews: Review[];
  approvals: Approval[];
  implementations: ImplementationRecord[];
  metrics: MetricValidation[];
  evidence: Pick<Evidence, "id" | "verified">[];
  openCriticalFindings: number;
  today: string; // ISO date, injected for testability
}

export interface KrSnapshot {
  kr: KeyResult;
  workItems: Pick<WorkItem, "id" | "work_code" | "status" | "title">[];
  metrics: MetricValidation[];
  today: string;
}

export interface QuarterEmployeeSnapshot {
  objectives: {
    objective_code: string;
    title: string;
    weight: string;
    krs: Pick<
      KeyResult,
      "id" | "kr_code" | "title" | "weight" | "status" | "achievement_percent" | "deadline"
    >[];
  }[];
  /** evidence completeness across the employee's quarter work, 0–100 */
  evidenceCompleteness: number;
  openWorkCodes: string[];
  today: string;
}
