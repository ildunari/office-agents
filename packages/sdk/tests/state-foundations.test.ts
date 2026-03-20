import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { TaskTracker } from "../src/state/tracker";
import type { TaskClassification } from "../src/planning";

const baseClassification: TaskClassification = {
  complexity: "simple",
  risk: "low",
  needsPlan: false,
  rationale: "Single targeted edit.",
};

describe("task tracker foundations", () => {
  it("starts a task and records tool calls", () => {
    const tracker = new TaskTracker();
    const task = tracker.beginTask(
      "Update the selected paragraph.",
      baseClassification,
      { planId: "plan-1" },
    );

    tracker.recordToolCall("tc-read");
    tracker.recordToolCall("tc-write");
    tracker.completeTask("Updated paragraph in place.");

    expect(task.planId).toBe("plan-1");
    expect(tracker.getCurrentTask()?.toolCallIds).toEqual([
      "tc-read",
      "tc-write",
    ]);
    expect(tracker.getCurrentTask()?.status).toBe("completed");
  });

  it("builds an undo narrative from tracked actions", () => {
    const tracker = new TaskTracker();
    tracker.beginTask("Delete a table row.", baseClassification);
    tracker.recordMutation({
      toolName: "modify_sheet_structure",
      scope: "Sheet1!4:4",
      summary: "Deleted row 4 from Sheet1",
    });

    const narrative = tracker.buildUndoNarrative();

    expect(narrative).toContain("Deleted row 4");
    expect(narrative).toContain("undo");
  });
});
