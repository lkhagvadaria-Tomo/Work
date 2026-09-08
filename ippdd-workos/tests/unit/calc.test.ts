import { describe, expect, it } from "vitest";
import { metricSatisfied, validateWeights, weightedAchievement } from "@/lib/okr/calc";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("weightedAchievement", () => {
  it("computes Σ objWeight × krWeight × achievement", () => {
    expect(
      weightedAchievement([
        { weight: 40, krs: [{ weight: 50, achievement_percent: 100 }, { weight: 50, achievement_percent: 0 }] },
        { weight: 60, krs: [{ weight: 100, achievement_percent: 50 }] },
      ]),
    ).toBe(50); // 0.4*0.5*100 + 0.6*1*50 = 20 + 30
  });

  it("treats null achievement as 0 and skips cancelled KRs", () => {
    expect(
      weightedAchievement([
        { weight: 100, krs: [
          { weight: 50, achievement_percent: null },
          { weight: 50, achievement_percent: 100, status: "CANCELLED" },
        ] },
      ]),
    ).toBe(0);
  });
});

describe("validateWeights (§35 import guard)", () => {
  it("accepts the authoritative pilot dataset (workbook extract)", () => {
    const pilot = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../scripts/pilot/la_okr_2026Q3.json"), "utf8"),
    ) as { objectives: { weight: string; krs: { weight: string }[] }[] };
    const errors = validateWeights(
      pilot.objectives.map((o) => ({
        weight: parseFloat(o.weight),
        krs: o.krs.map((k) => ({ weight: parseFloat(k.weight), achievement_percent: null })),
      })),
    );
    expect(errors).toEqual([]);
    expect(pilot.objectives).toHaveLength(3);
    expect(pilot.objectives.flatMap((o) => o.krs)).toHaveLength(10);
  });

  it("rejects wrong totals and negative weights", () => {
    expect(validateWeights([{ weight: 90, krs: [{ weight: 100, achievement_percent: null }] }])).not.toEqual([]);
    expect(
      validateWeights([{ weight: 100, krs: [{ weight: -10, achievement_percent: null }, { weight: 110, achievement_percent: null }] }]),
    ).not.toEqual([]);
  });
});

describe("metricSatisfied", () => {
  it("evaluates operators", () => {
    expect(metricSatisfied("GTE", 80, 92)).toBe(true);
    expect(metricSatisfied("GTE", 80, 79.9)).toBe(false);
    expect(metricSatisfied("LTE", 2, 1)).toBe(true);
    expect(metricSatisfied("EQ", 13, 13)).toBe(true);
    expect(metricSatisfied("BOOLEAN", null, 1)).toBe(true);
    expect(metricSatisfied("GTE", 80, null)).toBe(false);
    expect(metricSatisfied("GTE", null, 90)).toBe(false);
  });
});
