import type { WorkStatus } from "@/types/db";

/**
 * Central work-item state machine (§15). Mirrors the database's
 * work_state_transitions table + trigger; the DB remains authoritative, this
 * copy powers the UI and server actions without a round trip.
 *
 * CLOSED is intentionally absent from user-driven targets: it is reachable
 * only through the closure gate + human sign-off (D-005).
 */
export const TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  NOT_STARTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["SUBMITTED", "BLOCKED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "RETURNED"],
  UNDER_REVIEW: ["REVIEW_PASSED", "RETURNED", "REJECTED"],
  REVIEW_PASSED: ["WAITING_APPROVAL"],
  WAITING_APPROVAL: ["APPROVED", "RETURNED", "REJECTED"],
  APPROVED: ["IMPLEMENTATION", "VALIDATION"],
  IMPLEMENTATION: ["VALIDATION", "BLOCKED"],
  VALIDATION: ["BLOCKED"],
  RETURNED: ["IN_PROGRESS", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  REJECTED: ["IN_PROGRESS", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

/** Statuses from which the system (not the user) may close, given gate pass. */
export const CLOSABLE_FROM: WorkStatus[] = [
  "APPROVED",
  "IMPLEMENTATION",
  "VALIDATION",
];

/** Simplified-closure work types may also close straight from IN_PROGRESS. */
export const CLOSABLE_FROM_SIMPLIFIED: WorkStatus[] = [
  ...CLOSABLE_FROM,
  "IN_PROGRESS",
];

export function canTransition(from: WorkStatus, to: WorkStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const OPEN_STATUSES: WorkStatus[] = [
  "NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "REVIEW_PASSED",
  "WAITING_APPROVAL", "APPROVED", "IMPLEMENTATION", "VALIDATION",
  "RETURNED", "BLOCKED", "REJECTED",
];

export function isTerminal(status: WorkStatus): boolean {
  return status === "CLOSED" || status === "CANCELLED";
}

/** The context-sensitive primary action for the owner (§26). */
export function ownerPrimaryAction(
  status: WorkStatus,
  opts: { simplified: boolean },
):
  | { action: "START_WORK"; to: WorkStatus }
  | { action: "SUBMIT_FOR_REVIEW"; to: WorkStatus }
  | { action: "RESUBMIT"; to: WorkStatus }
  | { action: "REQUEST_APPROVAL"; to: WorkStatus }
  | { action: "RECORD_IMPLEMENTATION"; to: null }
  | { action: "SUBMIT_FOR_CLOSURE"; to: null }
  | null {
  switch (status) {
    case "NOT_STARTED":
      return { action: "START_WORK", to: "IN_PROGRESS" };
    case "IN_PROGRESS":
      return opts.simplified
        ? { action: "SUBMIT_FOR_CLOSURE", to: null }
        : { action: "SUBMIT_FOR_REVIEW", to: "SUBMITTED" };
    case "RETURNED":
    case "REJECTED":
    case "BLOCKED":
      return { action: "RESUBMIT", to: "IN_PROGRESS" };
    case "REVIEW_PASSED":
      return { action: "REQUEST_APPROVAL", to: "WAITING_APPROVAL" };
    case "APPROVED":
    case "VALIDATION":
      return { action: "SUBMIT_FOR_CLOSURE", to: null };
    case "IMPLEMENTATION":
      return { action: "RECORD_IMPLEMENTATION", to: null };
    default:
      return null;
  }
}
