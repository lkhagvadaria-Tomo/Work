import type { KrStatus, WorkStatus } from "@/types/db";

/**
 * Deterministic Next Action engine (§21). Rule-based, prioritized:
 * 1 overdue → 2 critical/high blocker → 3 approval dependency →
 * 4 upcoming deadline → 5 missing evidence → 6 normal next step.
 * The AI agent may EXPLAIN these; it does not generate them.
 */

export interface NextActionInput {
  workItems: {
    id: string;
    work_code: string;
    title: string;
    status: WorkStatus;
    deadline: string | null;
    priority: string;
    evidence_count: number;
    kr_label: string | null;
    simplified: boolean;
  }[];
  krs: {
    id: string;
    label: string; // e.g. O1-KR1
    status: KrStatus;
    deadline: string | null;
    open_work: number;
  }[];
  today: string;
}

export interface NextAction {
  rank: number;
  reason:
    | "OVERDUE" | "BLOCKER" | "APPROVAL_DEPENDENCY"
    | "DEADLINE_SOON" | "EVIDENCE_MISSING" | "NEXT_STEP";
  entityType: "work_item" | "key_result";
  entityId: string;
  label: string;
  action: string;
}

const STEP_ACTION: Partial<Record<WorkStatus, string>> = {
  NOT_STARTED: "Ажлыг эхлүүл (START WORK)",
  IN_PROGRESS: "Deliverable-уудаа бүрдүүлж review-д илгээ",
  SUBMITTED: "Хянагчийн шийдвэрийг хүлээж байна — шаардлагатай бол сануул",
  UNDER_REVIEW: "Хянагчийн шийдвэрийг хүлээж байна",
  REVIEW_PASSED: "Батлах хүсэлт илгээ (REQUEST APPROVAL)",
  WAITING_APPROVAL: "Батлагчийн шийдвэрийг хүлээж байна",
  APPROVED: "Хаалтын хүсэлт илгээ (SUBMIT FOR CLOSURE)",
  IMPLEMENTATION: "Хэрэгжилтийг бүртгэж нотолгоо хавсарга",
  VALIDATION: "Метрик баталгаажуулалтыг гүйцээ",
  RETURNED: "Буцаасан тайлбарыг тусгаж дахин илгээ (RESUBMIT)",
  BLOCKED: "Блоклосон шалтгааныг шийдвэрлэ",
  REJECTED: "Татгалзсан шалтгааныг шинжилж дахин төлөвлө",
};

export function computeNextActions(input: NextActionInput, limit = 8): NextAction[] {
  const actions: NextAction[] = [];
  const soon = addDays(input.today, 7);

  for (const w of input.workItems) {
    if (w.status === "CLOSED" || w.status === "CANCELLED") continue;
    const label = `${w.work_code}${w.kr_label ? ` (${w.kr_label})` : ""}`;
    const step = STEP_ACTION[w.status] ?? "Дараагийн алхмаа тодорхойл";

    if (w.deadline && w.deadline < input.today) {
      actions.push({
        rank: 1, reason: "OVERDUE", entityType: "work_item", entityId: w.id,
        label, action: `Хугацаа хэтэрсэн (${w.deadline}). ${step}`,
      });
    } else if (w.status === "BLOCKED" || w.status === "REJECTED" ||
               (w.priority === "CRITICAL" && w.status === "RETURNED")) {
      actions.push({
        rank: 2, reason: "BLOCKER", entityType: "work_item", entityId: w.id,
        label, action: step,
      });
    } else if (w.status === "WAITING_APPROVAL" || w.status === "REVIEW_PASSED") {
      actions.push({
        rank: 3, reason: "APPROVAL_DEPENDENCY", entityType: "work_item", entityId: w.id,
        label, action: step,
      });
    } else if (w.deadline && w.deadline <= soon) {
      actions.push({
        rank: 4, reason: "DEADLINE_SOON", entityType: "work_item", entityId: w.id,
        label, action: `Хугацаа дөхөж байна (${w.deadline}). ${step}`,
      });
    } else if (w.evidence_count === 0 && w.status !== "NOT_STARTED") {
      actions.push({
        rank: 5, reason: "EVIDENCE_MISSING", entityType: "work_item", entityId: w.id,
        label, action: "Нотолгоо бүртгэгдээгүй — Drive evidence холбо",
      });
    } else {
      actions.push({
        rank: 6, reason: "NEXT_STEP", entityType: "work_item", entityId: w.id,
        label, action: step,
      });
    }
  }

  for (const k of input.krs) {
    if (k.status === "CLOSED" || k.status === "CANCELLED") continue;
    if (k.deadline && k.deadline < input.today && k.open_work === 0) {
      actions.push({
        rank: 1, reason: "OVERDUE", entityType: "key_result", entityId: k.id,
        label: k.label,
        action: "Бүх ажил хаагдсан — KR хаалтын хүсэлт илгээж захирлын sign-off ав",
      });
    }
  }

  return actions
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
