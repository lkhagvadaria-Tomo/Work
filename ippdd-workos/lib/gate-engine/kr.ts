import type { EngineFinding, GateCheck, GateEvaluation, KrSnapshot } from "./types";
import { rollup } from "./engine";

/** KR closure gate: all governed work closed + KR metric achieved (§18). */
export function evaluateKrClosure(s: KrSnapshot): GateEvaluation {
  const checks: GateCheck[] = [];
  const findings: EngineFinding[] = [];

  const open = s.workItems.filter(
    (w) => w.status !== "CLOSED" && w.status !== "CANCELLED",
  );
  if (open.length > 0) {
    checks.push({ key: "KR_WORK_CLOSED", gate: "G7", required: true, result: "FAIL" });
    findings.push({
      severity: "CRITICAL",
      result: "FAIL",
      title: `Хаагдаагүй ажил: ${open.map((w) => w.work_code).join(", ")}`,
      recommendedAction: "KR хаахын өмнө бүх холбогдох ажлыг хаалтын гейтээр оруул.",
    });
  } else if (s.workItems.length === 0) {
    checks.push({ key: "KR_WORK_CLOSED", gate: "G7", required: true, result: "WARNING" });
    findings.push({
      severity: "MEDIUM",
      result: "WARNING",
      title: "Энэ KR-д бүртгэлтэй ажил алга",
      recommendedAction: "KR-ийг хэрэгжүүлсэн ажлын бүртгэл, нотолгоог холбо.",
    });
  } else {
    checks.push({ key: "KR_WORK_CLOSED", gate: "G7", required: true, result: "PASS" });
  }

  if (s.metrics.length === 0) {
    checks.push({ key: "KR_METRIC_SATISFIED", gate: "G6", required: true, result: "WARNING" });
    findings.push({
      severity: "MEDIUM",
      result: "WARNING",
      title: "KR метрикийн баталгаажуулалт бүртгэгдээгүй",
      recommendedAction: "Тооцох аргачлалын дагуу бодит утгыг нотолгоотой бүртгэ.",
    });
  } else {
    const failing = s.metrics.filter((m) => m.validation_status === "FAIL");
    const pending = s.metrics.filter((m) => m.validation_status === "PENDING");
    if (failing.length > 0 || pending.length > 0) {
      checks.push({ key: "KR_METRIC_SATISFIED", gate: "G6", required: true, result: "FAIL" });
      findings.push({
        severity: "CRITICAL",
        result: "FAIL",
        title:
          failing.length > 0
            ? `KR метрик зорилтдоо хүрээгүй: ${failing.map((m) => m.metric_name).join(", ")}`
            : `KR метрик баталгаажаагүй: ${pending.map((m) => m.metric_name).join(", ")}`,
        recommendedAction: "KR ACHIEVED ≠ ажил дууссан: метрикийг бодитоор баталгаажуул.",
      });
    } else {
      checks.push({ key: "KR_METRIC_SATISFIED", gate: "G6", required: true, result: "PASS" });
    }
  }

  if (s.kr.deadline && s.kr.deadline < s.today && s.kr.status !== "CLOSED") {
    checks.push({ key: "DEADLINE_CHECK", gate: "W", required: false, result: "WARNING" });
    findings.push({
      severity: "MEDIUM",
      result: "WARNING",
      title: `KR хугацаа хэтэрсэн (${s.kr.deadline})`,
    });
  }

  return rollup(checks, findings);
}
