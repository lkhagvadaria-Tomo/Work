import { describe, expect, it } from "vitest";
import { evaluateWorkClosure } from "@/lib/gate-engine/engine";
import { evaluateKrClosure } from "@/lib/gate-engine/kr";
import { evaluateQuarterClosure } from "@/lib/gate-engine/quarter";
import type { WorkSnapshot } from "@/lib/gate-engine/types";
import type { ClosureProfile, WorkItem } from "@/types/db";

const TODAY = "2026-09-08";

function profile(overrides: Partial<ClosureProfile> = {}): ClosureProfile {
  return {
    id: "p", work_type: "STANDARD",
    requires_deliverables: true, requires_self_qc: true,
    required_review_types: ["FUNCTIONAL"],
    requires_approval: true, required_approval_types: ["DIRECTOR"],
    requires_implementation: false, requires_validation: false,
    requires_metric: false, requires_evidence: true, min_evidence_count: 1,
    simplified_closure: false, notes: null,
    ...overrides,
  };
}

function work(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "w1", key_result_id: "k1", owner_id: "e1", department_id: "d1",
    quarter_id: "q1", work_code: "W-001", title: "t", description: null,
    work_type: "STANDARD", priority: "MEDIUM", definition_of_done: null,
    acceptance_criteria: null, start_date: null, deadline: "2026-12-01",
    status: "APPROVED", reviewer_id: "e2", approver_id: "e3",
    implementation_required: false, validation_required: false,
    created_by: "e1", created_at: TODAY, submitted_at: null, closed_at: null,
    ...overrides,
  };
}

function completeSnapshot(overrides: Partial<WorkSnapshot> = {}): WorkSnapshot {
  return {
    work: work(),
    profile: profile(),
    requirements: [
      { id: "r1", work_item_id: "w1", name: "Журам", description: null, required: true, sequence: 1, require_final_version: true },
    ],
    deliverables: [
      { id: "d1", work_item_id: "w1", requirement_id: "r1", name: "Журам v1.0",
        drive_file_id: null, drive_url: null, drive_name: null, mime_type: null,
        version: "v1.0", status: "APPROVED", submitted_by: "e1", submitted_at: TODAY,
        final_version: true, drive_modified_time: null, approved_modified_time: null },
    ],
    reviews: [
      { id: "rv0", work_item_id: "w1", reviewer_id: "e1", review_type: "SELF_QC", deliverable_version: null, decision: "PASS", comment: null, created_at: TODAY, reviewed_at: TODAY },
      { id: "rv1", work_item_id: "w1", reviewer_id: "e2", review_type: "FUNCTIONAL", deliverable_version: "v1.0", decision: "PASS", comment: null, created_at: TODAY, reviewed_at: TODAY },
    ],
    approvals: [
      { id: "a1", work_item_id: "w1", approver_id: "e3", approval_type: "DIRECTOR", deliverable_version: "v1.0", decision: "APPROVE", comment: null, requested_at: TODAY, approved_at: TODAY },
    ],
    implementations: [],
    metrics: [],
    evidence: [{ id: "ev1", verified: true }],
    openCriticalFindings: 0,
    today: TODAY,
    ...overrides,
  };
}

describe("Gate Engine — work closure (G1–G7)", () => {
  it("passes a complete snapshot", () => {
    const r = evaluateWorkClosure(completeSnapshot());
    expect(r.result).toBe("PASS");
    expect(r.totals.failed).toBe(0);
  });

  it("fails when a required deliverable is missing its final version", () => {
    const s = completeSnapshot();
    s.deliverables[0].final_version = false;
    const r = evaluateWorkClosure(s);
    expect(r.result).toBe("FAIL");
    expect(r.checks.find((c) => c.key === "DELIVERABLES_COMPLETE")?.result).toBe("FAIL");
    expect(r.findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("fails without self QC when the profile requires it", () => {
    const s = completeSnapshot();
    s.reviews = s.reviews.filter((r) => r.review_type !== "SELF_QC");
    const r = evaluateWorkClosure(s);
    expect(r.checks.find((c) => c.key === "SELF_QC_PASSED")?.result).toBe("FAIL");
    expect(r.result).toBe("FAIL");
  });

  it("fails when a required review type has not passed", () => {
    const s = completeSnapshot();
    s.profile = profile({ required_review_types: ["FUNCTIONAL", "LEGAL"] });
    const r = evaluateWorkClosure(s);
    expect(r.result).toBe("FAIL");
    expect(r.findings.some((f) => f.title.includes("LEGAL"))).toBe(true);
  });

  it("fails when approval is missing (DELIVERED ≠ APPROVED)", () => {
    const s = completeSnapshot({ approvals: [] });
    const r = evaluateWorkClosure(s);
    expect(r.checks.find((c) => c.key === "APPROVALS_PASSED")?.result).toBe("FAIL");
    expect(r.result).toBe("FAIL");
  });

  it("fails when implementation is required but not LIVE/PILOT (APPROVED ≠ IMPLEMENTED)", () => {
    const s = completeSnapshot({ work: work({ implementation_required: true }) });
    const r = evaluateWorkClosure(s);
    expect(r.checks.find((c) => c.key === "IMPLEMENTATION_SATISFIED")?.result).toBe("FAIL");
    s.implementations = [{ id: "i1", work_item_id: "w1", implementation_status: "LIVE",
      environment: "production", implemented_at: TODAY, implemented_by: "e1",
      evidence_id: null, comment: null }];
    expect(evaluateWorkClosure(s).result).toBe("PASS");
  });

  it("fails on PENDING metric validation and passes once validated (IMPLEMENTED ≠ KR ACHIEVED)", () => {
    const s = completeSnapshot({
      work: work({ validation_required: true }),
      metrics: [{ id: "m1", key_result_id: null, work_item_id: "w1",
        metric_name: "Coverage", target_operator: "GTE", target_value: "80",
        actual_value: null, unit: "%", validation_status: "PENDING",
        evidence_id: null, validated_by: null, validated_at: null }],
    });
    expect(evaluateWorkClosure(s).result).toBe("FAIL");
    s.metrics[0].validation_status = "PASS";
    expect(evaluateWorkClosure(s).result).toBe("PASS");
  });

  it("fails on insufficient evidence", () => {
    const s = completeSnapshot({ evidence: [] });
    const r = evaluateWorkClosure(s);
    expect(r.checks.find((c) => c.key === "EVIDENCE_SUFFICIENT")?.result).toBe("FAIL");
  });

  it("blocks closure on open critical findings", () => {
    const s = completeSnapshot({ openCriticalFindings: 2 });
    expect(evaluateWorkClosure(s).result).toBe("FAIL");
  });

  it("warns (not fails) on overdue deadline", () => {
    const s = completeSnapshot({ work: work({ deadline: "2026-01-01" }) });
    const r = evaluateWorkClosure(s);
    expect(r.result).toBe("WARNING");
    expect(r.checks.find((c) => c.key === "DEADLINE_CHECK")?.result).toBe("WARNING");
  });

  it("flags approved-version drift as a warning (changed after approval)", () => {
    const s = completeSnapshot();
    s.deliverables[0].approved_modified_time = "2026-09-01T00:00:00Z";
    s.deliverables[0].drive_modified_time = "2026-09-05T00:00:00Z";
    const r = evaluateWorkClosure(s);
    expect(r.result).toBe("WARNING");
    expect(r.findings.some((f) => f.title.includes("ӨӨРЧЛӨГДСӨН"))).toBe(true);
  });

  it("respects a simplified profile (SPRINT/BAU): review + approval not applicable", () => {
    const s = completeSnapshot({
      profile: profile({
        requires_deliverables: false, required_review_types: [],
        requires_approval: false, required_approval_types: [],
        simplified_closure: true,
      }),
      approvals: [], deliverables: [], requirements: [],
    });
    const r = evaluateWorkClosure(s);
    expect(r.result).toBe("PASS");
    expect(r.checks.find((c) => c.key === "APPROVALS_PASSED")?.result).toBe("NOT_APPLICABLE");
  });
});

describe("Gate Engine — KR closure", () => {
  it("fails while governed work is open", () => {
    const r = evaluateKrClosure({
      kr: { id: "k1", objective_id: "o1", kr_code: "KR1", title: "t", description: null,
        weight: "40", target_description: null, target_value: null, target_unit: null,
        measurement_method: null, baseline: null, deadline: "2026-12-01",
        status: "IN_PROGRESS", achievement_value: null, achievement_percent: null, closed_at: null },
      workItems: [{ id: "w1", work_code: "W-001", status: "IN_PROGRESS", title: "t" }],
      metrics: [],
      today: TODAY,
    });
    expect(r.result).toBe("FAIL");
  });

  it("passes when all work closed and metrics validated", () => {
    const r = evaluateKrClosure({
      kr: { id: "k1", objective_id: "o1", kr_code: "KR1", title: "t", description: null,
        weight: "40", target_description: null, target_value: null, target_unit: null,
        measurement_method: null, baseline: null, deadline: "2026-12-01",
        status: "IN_PROGRESS", achievement_value: null, achievement_percent: "100", closed_at: null },
      workItems: [{ id: "w1", work_code: "W-001", status: "CLOSED", title: "t" }],
      metrics: [{ id: "m1", key_result_id: "k1", work_item_id: null, metric_name: "x",
        target_operator: "GTE", target_value: "80", actual_value: "92", unit: "%",
        validation_status: "PASS", evidence_id: null, validated_by: "e2", validated_at: TODAY }],
      today: TODAY,
    });
    expect(r.result).toBe("PASS");
  });
});

describe("Gate Engine — quarter closure", () => {
  const kr = (code: string, status: string, achievement: string | null) => ({
    id: code, kr_code: code, title: "t", weight: "50",
    status: status as never, achievement_percent: achievement, deadline: null,
  });

  it("blocks while any KR is open and reports each blocker", () => {
    const r = evaluateQuarterClosure({
      objectives: [
        { objective_code: "O1", title: "t", weight: "60", krs: [kr("KR1", "CLOSED", "100"), kr("KR2", "IN_PROGRESS", null)] },
      ],
      evidenceCompleteness: 100, openWorkCodes: [], today: TODAY,
    });
    expect(r.result).toBe("FAIL");
    expect(r.krsClosed).toBe(1);
    expect(r.krsTotal).toBe(2);
    expect(r.findings.some((f) => f.title.includes("O1-KR2"))).toBe(true);
  });

  it("is ready for sign-off when everything is closed", () => {
    const r = evaluateQuarterClosure({
      objectives: [
        { objective_code: "O1", title: "t", weight: "100", krs: [kr("KR1", "CLOSED", "100"), kr("KR2", "CLOSED", "50")] },
      ],
      evidenceCompleteness: 100, openWorkCodes: [], today: TODAY,
    });
    expect(r.result).toBe("PASS");
    expect(r.weightedAchievement).toBe(75);
  });
});
