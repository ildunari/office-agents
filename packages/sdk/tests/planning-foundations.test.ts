import { describe, expect, it } from "vitest";
import {
  buildDefaultPlan,
  formatPlanForPrompt,
  TaskClassifier,
  PlanManager,
  type TaskClassification,
} from "../src/planning";

const moderateClassification: TaskClassification = {
  complexity: "moderate",
  risk: "medium",
  needsPlan: true,
  suggestedSteps: 4,
  rationale: "Multiple dependent edits with verification required.",
};

describe("planning foundations", () => {
  it("skips classification for short questions", async () => {
    const classifier = new TaskClassifier();

    const result = await classifier.classify("Why?");

    expect(result.needsPlan).toBe(false);
    expect(result.complexity).toBe("trivial");
  });

  it("marks multi-step structural edits as needing a plan", async () => {
    const classifier = new TaskClassifier();

    const result = await classifier.classify(
      "Read the document, rewrite the introduction, update the conclusion, and verify formatting.",
    );

    expect(result.needsPlan).toBe(true);
    expect(result.risk).toBe("medium");
    expect(result.complexity).toBe("moderate");
  });

  it("builds a default plan with ordered read, write, and verify steps", () => {
    const plan = buildDefaultPlan(
      "Rewrite the introduction and verify the new wording.",
      moderateClassification,
    );

    expect(plan.steps.map((step) => step.kind)).toEqual([
      "read",
      "analyze",
      "write",
      "verify",
    ]);
    expect(plan.steps.every((step) => step.status === "pending")).toBe(true);
  });

  it("updates and revises the active plan", async () => {
    const manager = new PlanManager();
    const plan = await manager.createPlan(
      "Rewrite the document body.",
      moderateClassification,
    );

    manager.updateStep(plan.steps[0].id, "completed", {
      toolCallId: "tc-1",
      note: "Read completed",
    });
    manager.revisePlan(plan.id, "User changed scope to summary only.");

    const activePlan = manager.getActivePlan();
    expect(activePlan?.steps[0].status).toBe("completed");
    expect(activePlan?.mode).toBe("revised");
    expect(activePlan?.revisionNotes.at(-1)?.reason).toContain("summary");
  });

  it("formats plans for prompt injection", async () => {
    const manager = new PlanManager();
    const plan = await manager.createPlan(
      "Summarize the workbook findings.",
      moderateClassification,
    );

    const prompt = formatPlanForPrompt(plan);

    expect(prompt).toContain("<execution_plan>");
    expect(prompt).toContain(plan.steps[0].description);
    expect(prompt).toContain("pending");
  });
});
