import { describe, expect, it } from "vitest";
import {
  TRANSITIONS, canTransition, isTerminal, ownerPrimaryAction,
} from "@/lib/workflow/state-machine";
import type { WorkStatus } from "@/types/db";

describe("work state machine (§15)", () => {
  it("follows the core lifecycle", () => {
    const path: WorkStatus[] = [
      "NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW",
      "REVIEW_PASSED", "WAITING_APPROVAL", "APPROVED", "IMPLEMENTATION", "VALIDATION",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });

  it("forbids arbitrary jumps", () => {
    expect(canTransition("NOT_STARTED", "APPROVED")).toBe(false);
    expect(canTransition("SUBMITTED", "APPROVED")).toBe(false);
    expect(canTransition("IN_PROGRESS", "REVIEW_PASSED")).toBe(false);
    expect(canTransition("CLOSED", "IN_PROGRESS")).toBe(false);
    expect(canTransition("CANCELLED", "IN_PROGRESS")).toBe(false);
  });

  it("never offers CLOSED as a user-driven target", () => {
    for (const targets of Object.values(TRANSITIONS)) {
      expect(targets).not.toContain("CLOSED");
    }
  });

  it("supports exception states with recovery", () => {
    expect(canTransition("UNDER_REVIEW", "RETURNED")).toBe(true);
    expect(canTransition("RETURNED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("WAITING_APPROVAL", "REJECTED")).toBe(true);
    expect(canTransition("REJECTED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("BLOCKED", "IN_PROGRESS")).toBe(true);
  });

  it("marks terminal states", () => {
    expect(isTerminal("CLOSED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("IN_PROGRESS")).toBe(false);
  });

  it("offers only valid context actions to the owner", () => {
    expect(ownerPrimaryAction("NOT_STARTED", { simplified: false })?.action).toBe("START_WORK");
    expect(ownerPrimaryAction("IN_PROGRESS", { simplified: false })?.action).toBe("SUBMIT_FOR_REVIEW");
    expect(ownerPrimaryAction("IN_PROGRESS", { simplified: true })?.action).toBe("SUBMIT_FOR_CLOSURE");
    expect(ownerPrimaryAction("REVIEW_PASSED", { simplified: false })?.action).toBe("REQUEST_APPROVAL");
    expect(ownerPrimaryAction("APPROVED", { simplified: false })?.action).toBe("SUBMIT_FOR_CLOSURE");
    expect(ownerPrimaryAction("SUBMITTED", { simplified: false })).toBeNull();
    expect(ownerPrimaryAction("CLOSED", { simplified: false })).toBeNull();
  });
});
