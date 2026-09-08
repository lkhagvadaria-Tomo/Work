import type { GateResult, KrStatus, WorkStatus } from "@/types/db";

/**
 * Status semantics: every status shows a text label + icon glyph, never color
 * alone (§51). Mongolian labels for the pilot department.
 */

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  NOT_STARTED: "Эхлээгүй",
  IN_PROGRESS: "Хийгдэж байна",
  SUBMITTED: "Илгээсэн",
  UNDER_REVIEW: "Хянагдаж байна",
  REVIEW_PASSED: "Review давсан",
  WAITING_APPROVAL: "Батлал хүлээж байна",
  APPROVED: "Батлагдсан",
  IMPLEMENTATION: "Хэрэгжилт",
  VALIDATION: "Баталгаажуулалт",
  CLOSED: "Хаагдсан",
  RETURNED: "Буцаагдсан",
  BLOCKED: "Блоклогдсон",
  REJECTED: "Татгалзсан",
  CANCELLED: "Цуцлагдсан",
};

export const KR_STATUS_LABEL: Record<KrStatus, string> = {
  NOT_STARTED: "Эхлээгүй",
  IN_PROGRESS: "Хийгдэж байна",
  AT_RISK: "Эрсдэлтэй",
  ACHIEVED: "Хүрсэн",
  CLOSED: "Хаагдсан",
  CANCELLED: "Цуцлагдсан",
};

const WORK_STATUS_STYLE: Record<WorkStatus, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600 border-slate-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  SUBMITTED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  UNDER_REVIEW: "bg-indigo-50 text-indigo-700 border-indigo-200",
  REVIEW_PASSED: "bg-teal-50 text-teal-700 border-teal-200",
  WAITING_APPROVAL: "bg-amber-50 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  IMPLEMENTATION: "bg-cyan-50 text-cyan-700 border-cyan-200",
  VALIDATION: "bg-cyan-50 text-cyan-700 border-cyan-200",
  CLOSED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  RETURNED: "bg-orange-50 text-orange-700 border-orange-200",
  BLOCKED: "bg-red-50 text-red-700 border-red-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

export function WorkStatusBadge({ status }: { status: WorkStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${WORK_STATUS_STYLE[status]}`}
    >
      {WORK_STATUS_LABEL[status]}
    </span>
  );
}

const KR_STATUS_STYLE: Record<KrStatus, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600 border-slate-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  AT_RISK: "bg-orange-50 text-orange-700 border-orange-200",
  ACHIEVED: "bg-teal-50 text-teal-700 border-teal-200",
  CLOSED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

export function KrStatusBadge({ status }: { status: KrStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${KR_STATUS_STYLE[status]}`}
    >
      {KR_STATUS_LABEL[status]}
    </span>
  );
}

const GATE_STYLE: Record<GateResult, { label: string; cls: string; glyph: string }> = {
  PASS: { label: "PASS", cls: "bg-emerald-50 text-emerald-700 border-emerald-300", glyph: "✓" },
  WARNING: { label: "WARNING", cls: "bg-amber-50 text-amber-800 border-amber-300", glyph: "△" },
  FAIL: { label: "FAIL", cls: "bg-red-50 text-red-700 border-red-300", glyph: "✕" },
  NOT_APPLICABLE: { label: "N/A", cls: "bg-slate-50 text-slate-500 border-slate-200", glyph: "–" },
};

export function GateBadge({ result }: { result: GateResult }) {
  const s = GATE_STYLE[result];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${s.cls}`}
    >
      <span aria-hidden>{s.glyph}</span> {s.label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "CRITICAL"
      ? "bg-red-100 text-red-800 border-red-300"
      : severity === "HIGH"
        ? "bg-orange-50 text-orange-700 border-orange-300"
        : severity === "MEDIUM"
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {severity}
    </span>
  );
}
