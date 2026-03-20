import { beforeEach, describe, expect, it } from "vitest";
import type { OrchestratorState } from "../src/orchestration/types";
import { TaskStore } from "../src/state/TaskStore";
import { resetVfs } from "../src/vfs";

function sampleState(): OrchestratorState {
  return {
    activeTask: {
      id: "task-1",
      sessionId: "session-1",
      hostApp: "word",
      documentKey: "doc-1",
      prompt: "Rewrite the opening paragraph.",
      status: "executing",
      classification: {
        complexity: "moderate",
        mutatesDocument: true,
        risk: "medium",
        requiresVisiblePlan: true,
        requiresApprovalBeforeMutation: false,
        planMode: "guided",
        likelyPatternIds: ["word.format_fingerprinting"],
        targetScopes: [{ kind: "word.document", ref: "document" }],
        rationale: ["Detected edit request."],
      },
      planId: "plan-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    plan: {
      id: "plan-1",
      taskId: "task-1",
      hostApp: "word",
      version: 2,
      mode: "guided",
      status: "active",
      summary: "Inspect, rewrite, validate, summarize.",
      steps: [],
      activeStepId: undefined,
      selectedPatternIds: ["word.format_fingerprinting"],
      risk: {
        level: "medium",
        destructive: false,
        requiresValidation: true,
      },
      updatedAt: new Date().toISOString(),
    },
    phase: "execute",
    permissionMode: "confirm_risky",
    approvalRequest: null,
    waitingState: {
      kind: "approval",
      reason: "Structural change requires approval.",
      resumeMessage: "Approve the risky workbook mutation to continue.",
      actionClass: "structural_write",
      createdAt: new Date().toISOString(),
    },
    retryLedger: [
      {
        stepId: "step-1",
        attempts: 1,
        lastIssueSignature: "format-drift",
        lastApproachHash: "hash-a",
      },
    ],
    handoff: {
      taskId: "task-1",
      phase: "waiting_on_user",
      resumeMessage: "Approve the risky workbook mutation to continue.",
      lastCompletedStepId: "step-1",
      updatedAt: new Date().toISOString(),
    },
    workspaceGuidance: {
      version: 1,
      notes: ["Preserve tracked changes in Word."],
      updatedAt: new Date().toISOString(),
    },
    learnedMemory: {
      version: 1,
      entries: [
        {
          id: "pref-1",
          signal: "style",
          value: "Keep currency formatting unchanged unless asked.",
          source: "verification",
          updatedAt: new Date().toISOString(),
          count: 2,
        },
      ],
    },
    undoLog: [{ id: "undo-1", summary: "Checkpoint before rewrite", createdAt: new Date().toISOString() }],
    contextBudget: {
      usedPromptTokens: 1200,
      modelLimitTokens: 128000,
      reservedOutputTokens: 4000,
      pressure: "low",
    },
    hookTrace: [
      {
        hookId: "core.read-before-write",
        stage: "before_tool",
        toolName: "execute_office_js",
        outcome: "continued",
        at: new Date().toISOString(),
      },
    ],
  };
}

describe("TaskStore", () => {
  beforeEach(() => {
    resetVfs();
  });

  it("persists and reloads orchestration state from the VFS mirror", async () => {
    const store = new TaskStore();
    const state = sampleState();

    await store.save(state);
    const loaded = await store.load();

    expect(loaded).toEqual(state);
  });

  it("writes waiting and handoff artifacts separately for resumability", async () => {
    const store = new TaskStore();
    const state = sampleState();

    await store.save(state);
    const persisted = await store.loadArtifacts();

    expect(persisted.waitingState).toEqual(state.waitingState);
    expect(persisted.handoff).toEqual(state.handoff);
    expect(persisted.workspaceGuidance).toEqual(state.workspaceGuidance);
    expect(persisted.learnedMemory).toEqual(state.learnedMemory);
  });
});
