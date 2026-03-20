import { describe, expect, it } from "vitest";
import { classifyTask } from "../src/planning/classifier";
import { PlanManager } from "../src/planning/PlanManager";

describe("PlanManager", () => {
  it("creates discover-transform-validate plans for mutating tasks", () => {
    const classification = classifyTask({
      hostApp: "word",
      prompt: "Update the selected section and preserve the formatting.",
    });
    const manager = new PlanManager();

    const plan = manager.createPlan({
      taskId: "task-1",
      hostApp: "word",
      prompt: "Update the selected section and preserve the formatting.",
      classification,
    });

    expect(plan.mode).toBe("guided");
    expect(plan.steps.map((step) => step.kind)).toEqual([
      "discover",
      "transform",
      "validate",
      "communicate",
    ]);
    expect(plan.activeStepId).toBe(plan.steps[0]?.id);
  });

  it("applies update_plan payloads and keeps one active step", () => {
    const classification = classifyTask({
      hostApp: "excel",
      prompt: "Build a small summary table for this sheet.",
    });
    const manager = new PlanManager();
    const original = manager.createPlan({
      taskId: "task-2",
      hostApp: "excel",
      prompt: "Build a small summary table for this sheet.",
      classification,
    });

    const updated = manager.applyUpdate(original, {
      summary: "Inspect, build, validate, then report.",
      steps: [
        {
          id: original.steps[0].id,
          title: original.steps[0].title,
          objective: original.steps[0].objective,
          status: "completed",
        },
        {
          id: original.steps[1].id,
          title: original.steps[1].title,
          objective: original.steps[1].objective,
          status: "in_progress",
        },
      ],
    });

    expect(updated.version).toBe(original.version + 1);
    expect(updated.summary).toBe("Inspect, build, validate, then report.");
    expect(updated.activeStepId).toBe(original.steps[1].id);
    expect(
      updated.steps.filter((step) => step.status === "in_progress"),
    ).toHaveLength(1);
  });
});
