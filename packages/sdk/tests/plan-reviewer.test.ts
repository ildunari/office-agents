import { describe, expect, it } from "vitest";
import { PlanReviewer } from "../src/planning/PlanReviewer";
import { classifyTask } from "../src/planning/classifier";
import { PlanManager } from "../src/planning/PlanManager";

describe("PlanReviewer", () => {
  it("passes a mutating plan that includes discover, transform, validate, and communicate", () => {
    const reviewer = new PlanReviewer();
    const manager = new PlanManager();
    const plan = manager.createPlan({
      taskId: "task-1",
      hostApp: "word",
      prompt: "Rewrite the selected section and preserve formatting.",
      classification: classifyTask({
        hostApp: "word",
        prompt: "Rewrite the selected section and preserve formatting.",
      }),
    });

    const result = reviewer.review(plan);
    expect(result.status).toBe("pass");
  });

  it("fails a mutating plan when validation coverage is missing", () => {
    const reviewer = new PlanReviewer();
    const manager = new PlanManager();
    const plan = manager.createPlan({
      taskId: "task-2",
      hostApp: "excel",
      prompt: "Build a forecast model for this workbook.",
      classification: classifyTask({
        hostApp: "excel",
        prompt: "Build a forecast model for this workbook.",
      }),
    });

    plan.steps = plan.steps.filter((step) => step.kind !== "validate");
    const result = reviewer.review(plan);
    expect(result.status).toBe("fail");
    expect(result.issues[0]).toContain("validate");
  });
});
