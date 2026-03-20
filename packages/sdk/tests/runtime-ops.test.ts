import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRuntime, type RuntimeAdapter } from "../src/runtime";
import { configureNamespace } from "../src/storage/namespace";

let nsCounter = 0;
let currentDbName = "";

function freshNamespace() {
  nsCounter += 1;
  currentDbName = `RuntimeOpsTestDB_${nsCounter}`;
  configureNamespace({
    dbName: currentDbName,
    dbVersion: 2,
    localStoragePrefix: `runtime-ops-test-${nsCounter}`,
    documentSettingsPrefix: `runtime-ops-test-${nsCounter}`,
    documentIdSettingsKey: `runtime-ops-test-${nsCounter}-document-id`,
  });
}

function createAdapter(
  overrides: Partial<RuntimeAdapter> = {},
): RuntimeAdapter {
  return {
    tools: [],
    buildSystemPrompt: () => "You are a test assistant.",
    getDocumentId: async () => "doc-ops-test",
    ...overrides,
  };
}

async function deleteCurrentDb() {
  if (!currentDbName) return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(currentDbName);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe("AgentRuntime operational flow", () => {
  beforeEach(() => {
    freshNamespace();
  });

  afterEach(async () => {
    await deleteCurrentDb();
  });

  it("enters awaiting approval for destructive high-risk work instead of prompting immediately", async () => {
    const runtime = new AgentRuntime(
      createAdapter({
        estimateScopeRisk: async () => ({
          level: "high",
          destructive: true,
          requiresApproval: true,
          reasons: ["Workbook-wide destructive mutation"],
          scopeSummary: "Workbook",
          constraints: ["Do not overwrite formulas"],
          expectedEffects: ["Rows removed only after approval"],
        }),
      }) as RuntimeAdapter,
    );

    runtime.applyConfig({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      useProxy: false,
      proxyUrl: "",
      thinking: "none",
      followMode: true,
      expandToolCalls: false,
    });

    const promptSpy = vi.fn(async () => {});
    (runtime as any).agent.prompt = promptSpy;

    await runtime.sendMessage("Delete the entire workbook structure and rebuild it.");

    const state = runtime.getState();
    expect(state.mode).toBe("awaiting_approval");
    expect(state.approvalRequest?.destructive).toBe(true);
    expect(state.handoff?.nextRecommendedAction).toContain("Approve");
    expect(promptSpy).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("approves the active plan and resumes execution", async () => {
    const runtime = new AgentRuntime(
      createAdapter({
        estimateScopeRisk: async () => ({
          level: "high",
          destructive: true,
          requiresApproval: true,
          reasons: ["Structural rewrite"],
          scopeSummary: "Workbook",
          constraints: [],
          expectedEffects: ["Workbook rewritten"],
        }),
      }) as RuntimeAdapter,
    );

    runtime.applyConfig({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      useProxy: false,
      proxyUrl: "",
      thinking: "none",
      followMode: true,
      expandToolCalls: false,
    });

    const promptSpy = vi.fn(async () => {});
    (runtime as any).agent.prompt = promptSpy;

    await runtime.sendMessage("Delete the workbook and rebuild it safely.");
    await runtime.approveActivePlan();

    expect(runtime.getState().mode).toBe("execute");
    expect(runtime.getState().approvalRequest).toBeNull();
    expect(promptSpy).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("builds a blocked handoff when verification fails", async () => {
    const runtime = new AgentRuntime(
      createAdapter({
        getVerificationSuites: () => [
          {
            id: "suite-fail",
            label: "Failing verifier",
            appliesTo: () => true,
            verify: () => ({
              suiteId: "suite-fail",
              label: "Failing verifier",
              expectedEffect: "Expected",
              observedEffect: "Observed mismatch",
              status: "failed",
              evidence: ["Mismatch found"],
              retryable: false,
            }),
          },
        ],
      }) as RuntimeAdapter,
    );

    await runtime.init();
    runtime.applyConfig({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      useProxy: false,
      proxyUrl: "",
      thinking: "none",
      followMode: true,
      expandToolCalls: false,
    });

    (runtime as any).taskTracker.beginTask(
      "Rewrite the section and verify it.",
      {
        complexity: "moderate",
        risk: "medium",
        needsPlan: true,
        rationale: "Needs verification.",
      },
      { mode: "execute" },
    );
    runtime.getState().activeTask = (runtime as any).taskTracker.getCurrentTask();
    await (runtime as any).runVerificationPhase("Rewrite the section and verify it.");

    expect(runtime.getState().mode).toBe("blocked");
    expect(runtime.getState().lastVerification?.status).toBe("failed");
    expect(runtime.getState().handoff?.incompleteVerifications).toContain(
      "suite-fail",
    );
    runtime.dispose();
  });
});
