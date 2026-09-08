import { describe, expect, it } from "vitest";
import { computeNextActions } from "@/lib/next-actions";

const TODAY = "2026-09-08";
const base = {
  id: "w", work_code: "W", title: "t", priority: "MEDIUM",
  evidence_count: 1, kr_label: null, simplified: false,
};

describe("next-action engine (§21 priority order)", () => {
  it("ranks overdue > blocker > approval > deadline-soon > evidence > next-step", () => {
    const actions = computeNextActions({
      workItems: [
        { ...base, id: "a", work_code: "A", status: "IN_PROGRESS", deadline: "2026-09-30" },
        { ...base, id: "b", work_code: "B", status: "IN_PROGRESS", deadline: "2026-09-01" }, // overdue
        { ...base, id: "c", work_code: "C", status: "WAITING_APPROVAL", deadline: null },
        { ...base, id: "d", work_code: "D", status: "BLOCKED", deadline: null },
        { ...base, id: "e", work_code: "E", status: "IN_PROGRESS", deadline: "2026-09-10" }, // soon
        { ...base, id: "f", work_code: "F", status: "IN_PROGRESS", deadline: null, evidence_count: 0 },
      ],
      krs: [],
      today: TODAY,
    });
    expect(actions.map((a) => a.reason)).toEqual([
      "OVERDUE", "BLOCKER", "APPROVAL_DEPENDENCY", "DEADLINE_SOON", "EVIDENCE_MISSING", "NEXT_STEP",
    ]);
    expect(actions[0].label).toContain("B");
  });

  it("skips closed/cancelled work and suggests KR closure when all work done", () => {
    const actions = computeNextActions({
      workItems: [{ ...base, id: "z", work_code: "Z", status: "CLOSED", deadline: "2026-01-01" }],
      krs: [{ id: "k1", label: "O1-KR1", status: "IN_PROGRESS", deadline: "2026-09-01", open_work: 0 }],
      today: TODAY,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].entityType).toBe("key_result");
    expect(actions[0].action).toContain("KR хаалтын хүсэлт");
  });
});
