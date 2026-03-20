import { describe, expect, it } from "vitest";
import {
  contextBudgetLabel,
  getPlanProgress,
  incompleteVerificationCount,
  modeLabel,
  shouldShowApprove,
  shouldShowResume,
  statusLabel,
  stepLabel,
  verificationLabel,
} from "../src/chat/plan-checklist";

const activePlan = {
  summary: "Rewrite the selected section safely",
  status: "active",
  steps: [
    { id: "read", title: "Read current content", status: "completed" },
    { id: "draft", title: "Draft replacement", status: "active" },
    { id: "verify", title: "Verify formatting", status: "pending" },
  ],
};

describe("PlanChecklist", () => {
  it("formats status labels cleanly", () => {
    expect(statusLabel("in_progress")).toBe("in progress");
    expect(statusLabel(undefined)).toBe("planned");
    expect(modeLabel("awaiting_approval")).toBe("awaiting approval");
    expect(verificationLabel({ status: "retryable" })).toBe("retryable");
    expect(contextBudgetLabel({ action: "compact", usagePct: 76 })).toBe(
      "compact @ 76%",
    );
  });

  it("prefers title, then description, then id for step labels", () => {
    expect(stepLabel({ id: "draft", title: "Draft replacement" })).toBe(
      "Draft replacement",
    );
    expect(stepLabel({ id: "verify", description: "Verify formatting" })).toBe(
      "Verify formatting",
    );
    expect(stepLabel({ id: "read" })).toBe("read");
  });

  it("counts completed steps plus the active step toward visible progress", () => {
    expect(getPlanProgress(null)).toEqual({
      total: 0,
      completed: 0,
      inFlight: 0,
      percent: 0,
    });

    expect(getPlanProgress(activePlan)).toEqual({
      total: 3,
      completed: 2,
      inFlight: 1,
      percent: (2 / 3) * 100,
    });
  });

  it("shows approve and resume affordances only for the matching runtime modes", () => {
    expect(
      shouldShowApprove("awaiting_approval", {
        reason: "Destructive workbook edit",
      }),
    ).toBe(true);
    expect(shouldShowApprove("execute", null)).toBe(false);

    expect(
      shouldShowResume("blocked", {
        handoff: {
          nextRecommendedAction: "Resume after review",
          incompleteVerifications: ["suite-a", "suite-b"],
        },
      }),
    ).toBe(true);
    expect(
      incompleteVerificationCount({
        handoff: {
          nextRecommendedAction: "Resume",
          incompleteVerifications: ["suite-a", "suite-b"],
        },
      }),
    ).toBe(2);
  });
});
