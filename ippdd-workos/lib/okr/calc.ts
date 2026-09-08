/** OKR calculations. Weighted achievement = Σ objWeight% × Σ krWeight% × krAchievement. */

export interface ObjectiveForCalc {
  weight: string | number;
  krs: { weight: string | number; achievement_percent: string | number | null; status?: string }[];
}

export function weightedAchievement(objectives: ObjectiveForCalc[]): number {
  let total = 0;
  for (const o of objectives) {
    const ow = Number(o.weight) / 100;
    for (const k of o.krs) {
      if (k.status === "CANCELLED") continue;
      const kw = Number(k.weight) / 100;
      const a = k.achievement_percent == null ? 0 : Number(k.achievement_percent);
      total += ow * kw * a;
    }
  }
  return Math.round(total * 100) / 100;
}

/** Validate that KR weights inside each objective sum to ~100 (import guard, §35). */
export function validateWeights(objectives: ObjectiveForCalc[]): string[] {
  const errors: string[] = [];
  const objSum = objectives.reduce((s, o) => s + Number(o.weight), 0);
  if (Math.abs(objSum - 100) > 0.01) {
    errors.push(`Objective weights sum to ${objSum}, expected 100`);
  }
  objectives.forEach((o, i) => {
    if (Number(o.weight) < 0) errors.push(`Objective ${i + 1} has negative weight`);
    const krSum = o.krs.reduce((s, k) => s + Number(k.weight), 0);
    if (o.krs.length > 0 && Math.abs(krSum - 100) > 0.01) {
      errors.push(`Objective ${i + 1}: KR weights sum to ${krSum}, expected 100`);
    }
    o.krs.forEach((k, j) => {
      if (Number(k.weight) < 0) errors.push(`Objective ${i + 1} KR ${j + 1} has negative weight`);
    });
  });
  return errors;
}

/** Metric satisfaction for a target operator. */
export function metricSatisfied(
  op: "GTE" | "LTE" | "GT" | "LT" | "EQ" | "BOOLEAN",
  target: number | null,
  actual: number | null,
): boolean {
  if (actual == null) return false;
  if (op === "BOOLEAN") return actual > 0;
  if (target == null) return false;
  switch (op) {
    case "GTE": return actual >= target;
    case "LTE": return actual <= target;
    case "GT":  return actual > target;
    case "LT":  return actual < target;
    case "EQ":  return actual === target;
  }
}
