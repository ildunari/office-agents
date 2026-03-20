import { describe, expect, it, vi } from "vitest";
import { ContextManager } from "../src/context/manager";
import { PatternRegistry } from "../src/patterns/registry";
import type { TaskClassification } from "../src/planning";
import type { ExecutionPlan } from "../src/planning/types";
import type { ReasoningPattern } from "../src/patterns/types";

const classification: TaskClassification = {
  complexity: "moderate",
  risk: "medium",
  needsPlan: true,
  rationale: "Requires scoped editing and verification.",
};

const fakePlan: ExecutionPlan = {
  id: "plan-1",
  userRequest: "Rewrite the section and verify formatting.",
  mode: "auto",
  status: "active",
  steps: [],
  createdAt: 1,
  updatedAt: 1,
  classification,
  revisionNotes: [],
};

describe("context and pattern foundations", () => {
  it("selects compaction actions from context thresholds", () => {
    const manager = new ContextManager();

    expect(manager.getActionForUsage(59)).toBe("none");
    expect(manager.getActionForUsage(60)).toBe("summarize");
    expect(manager.getActionForUsage(76)).toBe("compact");
    expect(manager.getActionForUsage(86)).toBe("prune");
    expect(manager.getActionForUsage(95)).toBe("emergency");
  });

  it("returns stable working-memory paths", () => {
    const manager = new ContextManager();
    const paths = manager.getWorkingMemoryPaths("plan-1");

    expect(paths.plan).toBe("/.oa/plans/plan-1.json");
    expect(paths.taskState).toBe("/.oa/state/task.json");
  });

  it("activates only patterns whose triggers match the classification", () => {
    const registry = new PatternRegistry();
    const activate = vi.fn(() => ({ dispose: vi.fn() }));

    const pattern: ReasoningPattern = {
      id: "word:format-preservation",
      name: "Format Preservation",
      apps: ["word"],
      defaultState: () => ({}),
      triggers: (nextClassification) => nextClassification.risk === "medium",
      activate,
    };

    registry.register(pattern);
    registry.activateMatching({}, classification, fakePlan);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(registry.getActivePatternIds()).toEqual([
      "word:format-preservation",
    ]);
  });
});
