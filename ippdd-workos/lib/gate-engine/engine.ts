import type { GateResult } from "@/types/db";
import type { EngineFinding, GateCheck, GateEvaluation, WorkSnapshot } from "./types";

/**
 * Deterministic Gate Engine (§17–18). Pure function: snapshot in, structured
 * evaluation out. No AI, no I/O, no clock reads (today is injected).
 *
 * Rollup: any required FAIL → FAIL; else any WARNING → WARNING; else PASS.
 */
export function evaluateWorkClosure(s: WorkSnapshot): GateEvaluation {
  const checks: GateCheck[] = [];
  const findings: EngineFinding[] = [];
  const p = s.profile;

  const add = (
    check: Omit<GateCheck, "result"> & { result: GateResult },
    finding?: EngineFinding,
  ) => {
    checks.push(check);
    if (finding) findings.push(finding);
  };

  // G1 — deliverables ---------------------------------------------------------
  if (p.requires_deliverables) {
    const requiredReqs = s.requirements.filter((r) => r.required);
    const missing = requiredReqs.filter((r) => {
      const dels = s.deliverables.filter((d) => d.requirement_id === r.id);
      if (dels.length === 0) return true;
      return r.require_final_version && !dels.some((d) => d.final_version);
    });
    if (requiredReqs.length === 0) {
      add(
        { key: "DELIVERABLES_COMPLETE", gate: "G1", required: true, result: "WARNING" },
        {
          severity: "MEDIUM",
          result: "WARNING",
          title: "Шаардлагатай deliverable тодорхойлогдоогүй",
          recommendedAction: "Ажлын deliverable requirement-уудыг бүртгэ.",
        },
      );
    } else if (missing.length > 0) {
      add(
        { key: "DELIVERABLES_COMPLETE", gate: "G1", required: true, result: "FAIL" },
        {
          severity: "CRITICAL",
          result: "FAIL",
          title: `Deliverable дутуу: ${missing.map((m) => m.name).join(", ")}`,
          description: `${requiredReqs.length - missing.length}/${requiredReqs.length} бүрдсэн.`,
          recommendedAction: "Дутуу deliverable-уудыг эцсийн хувилбараар хавсарга.",
        },
      );
    } else {
      add({ key: "DELIVERABLES_COMPLETE", gate: "G1", required: true, result: "PASS" });
    }
  } else {
    add({ key: "DELIVERABLES_COMPLETE", gate: "G1", required: false, result: "NOT_APPLICABLE" });
  }

  // G2 — self QC ---------------------------------------------------------------
  if (p.requires_self_qc) {
    const passed = s.reviews.some((r) => r.review_type === "SELF_QC" && r.decision === "PASS");
    add(
      { key: "SELF_QC_PASSED", gate: "G2", required: true, result: passed ? "PASS" : "FAIL" },
      passed
        ? undefined
        : {
            severity: "HIGH",
            result: "FAIL",
            title: "Self QC хийгдээгүй",
            recommendedAction: "Эзэмшигч өөрийн чанарын шалгалтыг (SELF_QC) бүртгэж PASS болго.",
          },
    );
  } else {
    add({ key: "SELF_QC_PASSED", gate: "G2", required: false, result: "NOT_APPLICABLE" });
  }

  // G3 — required reviews -------------------------------------------------------
  const reviewTypes = p.required_review_types.filter((t) => t !== "SELF_QC");
  if (reviewTypes.length > 0) {
    const missing = reviewTypes.filter(
      (t) => !s.reviews.some((r) => r.review_type === t && r.decision === "PASS"),
    );
    const rejected = s.reviews.filter((r) => r.decision === "REJECT");
    if (missing.length > 0 || rejected.length > 0) {
      add(
        { key: "REVIEWS_PASSED", gate: "G3", required: true, result: "FAIL" },
        {
          severity: "CRITICAL",
          result: "FAIL",
          title:
            rejected.length > 0
              ? "Review REJECT шийдвэртэй"
              : `Шаардлагатай review дутуу: ${missing.join(", ")}`,
          recommendedAction: "Дутуу review-г хүсэлт гаргаж PASS шийдвэр авах.",
        },
      );
    } else {
      add({ key: "REVIEWS_PASSED", gate: "G3", required: true, result: "PASS" });
    }
  } else {
    add({ key: "REVIEWS_PASSED", gate: "G3", required: false, result: "NOT_APPLICABLE" });
  }

  // G4 — approvals ---------------------------------------------------------------
  if (p.requires_approval && p.required_approval_types.length > 0) {
    const missing = p.required_approval_types.filter(
      (t) => !s.approvals.some((a) => a.approval_type === t && a.decision === "APPROVE"),
    );
    if (missing.length > 0) {
      add(
        { key: "APPROVALS_PASSED", gate: "G4", required: true, result: "FAIL" },
        {
          severity: "HIGH",
          result: "FAIL",
          title: `Батлал дутуу: ${missing.join(", ")}`,
          recommendedAction: "Эцсийн хувилбарыг батлах эрх бүхий түвшинд илгээ.",
        },
      );
    } else {
      const unversioned = p.required_approval_types.some((t) =>
        s.approvals.some(
          (a) => a.approval_type === t && a.decision === "APPROVE" && !a.deliverable_version,
        ),
      );
      add(
        { key: "APPROVALS_PASSED", gate: "G4", required: true, result: unversioned ? "WARNING" : "PASS" },
        unversioned
          ? {
              severity: "MEDIUM",
              result: "WARNING",
              title: "Батлал хувилбарын дугааргүй",
              description: "Батлал ямар хувилбарт өгөгдсөн нь тодорхойгүй байна.",
              recommendedAction: "Батлалд deliverable version-ийг тэмдэглэ.",
            }
          : undefined,
      );
    }
  } else {
    add({ key: "APPROVALS_PASSED", gate: "G4", required: false, result: "NOT_APPLICABLE" });
  }

  // G5 — implementation -----------------------------------------------------------
  const implRequired = p.requires_implementation || s.work.implementation_required;
  if (implRequired) {
    const satisfied = s.implementations.some((i) =>
      ["LIVE", "PILOT", "NOT_REQUIRED"].includes(i.implementation_status),
    );
    const failed = s.implementations.some((i) =>
      ["FAILED", "ROLLED_BACK"].includes(i.implementation_status),
    );
    add(
      {
        key: "IMPLEMENTATION_SATISFIED",
        gate: "G5",
        required: true,
        result: satisfied ? "PASS" : "FAIL",
      },
      satisfied
        ? undefined
        : {
            severity: "CRITICAL",
            result: "FAIL",
            title: failed
              ? "Хэрэгжилт амжилтгүй (FAILED/ROLLED_BACK)"
              : "Хэрэгжилтийн бүртгэл дутуу",
            recommendedAction:
              "Production/pilot хэрэгжилтийг нотолгоотой бүртгэ — батлагдсан нь хэрэгжсэн гэсэн үг биш.",
          },
    );
  } else {
    add({ key: "IMPLEMENTATION_SATISFIED", gate: "G5", required: false, result: "NOT_APPLICABLE" });
  }

  // G6 — metric validation -----------------------------------------------------------
  const metricRequired =
    p.requires_metric || p.requires_validation || s.work.validation_required;
  if (metricRequired) {
    if (s.metrics.length === 0) {
      add(
        { key: "METRIC_SATISFIED", gate: "G6", required: true, result: "FAIL" },
        {
          severity: "HIGH",
          result: "FAIL",
          title: "Хэмжих үзүүлэлт тодорхойлогдоогүй",
          recommendedAction: "Зорилтот метрик + бодит утга + нотолгоог бүртгэ.",
        },
      );
    } else {
      const failing = s.metrics.filter((m) => m.validation_status === "FAIL");
      const pending = s.metrics.filter((m) => m.validation_status === "PENDING");
      if (failing.length > 0) {
        add(
          { key: "METRIC_SATISFIED", gate: "G6", required: true, result: "FAIL" },
          {
            severity: "CRITICAL",
            result: "FAIL",
            title: `Метрик зорилтдоо хүрээгүй: ${failing.map((m) => m.metric_name).join(", ")}`,
            recommendedAction: "KR метрик бодитоор хангагдтал ажил хаагдахгүй.",
          },
        );
      } else if (pending.length > 0) {
        add(
          { key: "METRIC_SATISFIED", gate: "G6", required: true, result: "FAIL" },
          {
            severity: "HIGH",
            result: "FAIL",
            title: `Метрик баталгаажаагүй: ${pending.map((m) => m.metric_name).join(", ")}`,
            recommendedAction: "Бодит утгыг нотолгоотой баталгаажуул (validated_by, evidence).",
          },
        );
      } else {
        add({ key: "METRIC_SATISFIED", gate: "G6", required: true, result: "PASS" });
      }
    }
  } else {
    add({ key: "METRIC_SATISFIED", gate: "G6", required: false, result: "NOT_APPLICABLE" });
  }

  // G7 — evidence + open critical findings --------------------------------------------
  if (p.requires_evidence) {
    const enough = s.evidence.length >= p.min_evidence_count;
    add(
      { key: "EVIDENCE_SUFFICIENT", gate: "G7", required: true, result: enough ? "PASS" : "FAIL" },
      enough
        ? undefined
        : {
            severity: "HIGH",
            result: "FAIL",
            title: `Нотолгоо дутуу (${s.evidence.length}/${p.min_evidence_count})`,
            recommendedAction: "Drive нотолгоог холбож бүртгэ.",
          },
    );
  } else {
    add({ key: "EVIDENCE_SUFFICIENT", gate: "G7", required: false, result: "NOT_APPLICABLE" });
  }

  if (s.openCriticalFindings > 0) {
    add(
      { key: "CRITICAL_FINDINGS", gate: "G7", required: true, result: "FAIL" },
      {
        severity: "CRITICAL",
        result: "FAIL",
        title: `Шийдвэрлэгдээгүй critical finding: ${s.openCriticalFindings}`,
        recommendedAction: "Өмнөх gate run-ий critical finding-үүдийг шийдвэрлэ.",
      },
    );
  } else {
    add({ key: "CRITICAL_FINDINGS", gate: "G7", required: true, result: "PASS" });
  }

  // Warnings: deadline + version integrity ----------------------------------------------
  if (s.work.deadline && s.work.deadline < s.today && s.work.status !== "CLOSED") {
    add(
      { key: "DEADLINE_CHECK", gate: "W", required: false, result: "WARNING" },
      {
        severity: "MEDIUM",
        result: "WARNING",
        title: `Хугацаа хэтэрсэн (${s.work.deadline})`,
        recommendedAction: "Хугацааг шинэчлэх эсвэл яаралтай хаах.",
      },
    );
  } else {
    add({ key: "DEADLINE_CHECK", gate: "W", required: false, result: "PASS" });
  }

  const drifted = s.deliverables.filter(
    (d) =>
      d.final_version &&
      d.approved_modified_time &&
      d.drive_modified_time &&
      new Date(d.drive_modified_time) > new Date(d.approved_modified_time),
  );
  if (drifted.length > 0) {
    add(
      { key: "VERSION_INTEGRITY", gate: "W", required: false, result: "WARNING" },
      {
        severity: "HIGH",
        result: "WARNING",
        title: "БАТЛАГДСАН ХУВИЛБАР ӨӨРЧЛӨГДСӨН БАЙЖ БОЛЗОШГҮЙ",
        description: `Drive дээр батлагдсанаас хойш өөрчлөгдсөн: ${drifted
          .map((d) => d.name)
          .join(", ")} (metadata харьцуулалт — криптограф баталгаа биш).`,
        recommendedAction: "Өөрчлөлтийг хянаж, шаардлагатай бол дахин батлуул.",
      },
    );
  } else {
    add({ key: "VERSION_INTEGRITY", gate: "W", required: false, result: "PASS" });
  }

  return rollup(checks, findings);
}

export function rollup(checks: GateCheck[], findings: EngineFinding[]): GateEvaluation {
  const applicable = checks.filter((c) => c.result !== "NOT_APPLICABLE");
  const failed = applicable.filter((c) => c.result === "FAIL");
  const requiredFailed = failed.filter((c) => c.required);
  const warnings = applicable.filter((c) => c.result === "WARNING");
  const passed = applicable.filter((c) => c.result === "PASS");
  const result: GateResult =
    requiredFailed.length > 0
      ? "FAIL"
      : warnings.length > 0 || failed.length > 0
        ? "WARNING"
        : applicable.length === 0
          ? "NOT_APPLICABLE"
          : "PASS";
  return {
    result,
    checks,
    findings,
    totals: {
      total: applicable.length,
      passed: passed.length,
      warnings: warnings.length,
      failed: failed.length,
    },
  };
}
