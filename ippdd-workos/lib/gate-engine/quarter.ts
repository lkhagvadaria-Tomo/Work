import type { EngineFinding, GateCheck, GateEvaluation, QuarterEmployeeSnapshot } from "./types";
import { rollup } from "./engine";
import { weightedAchievement } from "@/lib/okr/calc";

export interface QuarterEvaluation extends GateEvaluation {
  krsTotal: number;
  krsClosed: number;
  weightedAchievement: number;
  evidenceCompleteness: number;
}

/** Quarter closure gate for one employee (§32). */
export function evaluateQuarterClosure(s: QuarterEmployeeSnapshot): QuarterEvaluation {
  const checks: GateCheck[] = [];
  const findings: EngineFinding[] = [];

  const krs = s.objectives.flatMap((o) =>
    o.krs
      .filter((k) => k.status !== "CANCELLED")
      .map((k) => ({ ...k, objective_code: o.objective_code })),
  );
  const openKrs = krs.filter((k) => k.status !== "CLOSED");

  if (openKrs.length > 0) {
    checks.push({ key: "QUARTER_KRS_CLOSED", gate: "G7", required: true, result: "FAIL" });
    for (const k of openKrs) {
      findings.push({
        severity: "CRITICAL",
        result: "FAIL",
        title: `${k.objective_code}-${k.kr_code} хаагдаагүй (${k.status})`,
        recommendedAction: "KR-ийг хаалтын гейтээр оруулж захирлын sign-off авах.",
        relatedEntityType: "key_result",
        relatedEntityId: k.id,
      });
    }
  } else {
    checks.push({ key: "QUARTER_KRS_CLOSED", gate: "G7", required: true, result: "PASS" });
  }

  if (s.openWorkCodes.length > 0) {
    checks.push({ key: "QUARTER_WORK_CLOSED", gate: "G7", required: true, result: "FAIL" });
    findings.push({
      severity: "HIGH",
      result: "FAIL",
      title: `Хаагдаагүй ажил: ${s.openWorkCodes.slice(0, 10).join(", ")}${s.openWorkCodes.length > 10 ? "…" : ""}`,
    });
  } else {
    checks.push({ key: "QUARTER_WORK_CLOSED", gate: "G7", required: true, result: "PASS" });
  }

  if (s.evidenceCompleteness < 100) {
    checks.push({ key: "QUARTER_EVIDENCE", gate: "G7", required: false, result: "WARNING" });
    findings.push({
      severity: "MEDIUM",
      result: "WARNING",
      title: `Нотолгооны бүрэн байдал ${s.evidenceCompleteness}%`,
      recommendedAction: "Нотолгоогүй ажлын бүртгэлүүдэд evidence холбо.",
    });
  } else {
    checks.push({ key: "QUARTER_EVIDENCE", gate: "G7", required: false, result: "PASS" });
  }

  const base = rollup(checks, findings);
  return {
    ...base,
    krsTotal: krs.length,
    krsClosed: krs.length - openKrs.length,
    weightedAchievement: weightedAchievement(s.objectives),
    evidenceCompleteness: s.evidenceCompleteness,
  };
}
