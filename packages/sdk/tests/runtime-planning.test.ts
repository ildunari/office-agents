import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePlanRecord, saveTaskRecord } from "../src/storage/db";
import { AgentRuntime, type RuntimeAdapter } from "../src/runtime";
import { configureNamespace } from "../src/storage/namespace";

let nsCounter = 0;
let currentDbName = "";

function freshNamespace() {
  nsCounter += 1;
  currentDbName = `RuntimePlanningTestDB_${nsCounter}`;
  configureNamespace({
    dbName: currentDbName,
    dbVersion: 2,
    localStoragePrefix: `runtime-planning-test-${nsCounter}`,
    documentSettingsPrefix: `runtime-planning-test-${nsCounter}`,
    documentIdSettingsKey: `runtime-planning-test-${nsCounter}-document-id`,
  });
}

function createAdapter(
  overrides: Partial<RuntimeAdapter> = {},
): RuntimeAdapter {
  return {
    tools: [],
    buildSystemPrompt: () => "You are a test assistant.",
    getDocumentId: async () => "doc-planning-test",
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

describe("AgentRuntime planning integration", () => {
  beforeEach(() => {
    freshNamespace();
  });

  afterEach(async () => {
    await deleteCurrentDb();
  });

  it("adds the internal update_plan tool to the active tool list", () => {
    const runtime = new AgentRuntime(createAdapter());

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

    const tools = ((runtime as any).agent?.state.tools ?? []).map(
      (tool: { name: string }) => tool.name,
    );
    expect(tools).toContain("update_plan");
    runtime.dispose();
  });

  it("creates active plan and task state for moderate requests before prompting", async () => {
    const runtime = new AgentRuntime(createAdapter());

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

    await runtime.sendMessage(
      "Read the current section, rewrite the introduction, then verify formatting and summarize the changes.",
    );

    const state = runtime.getState() as typeof runtime.getState extends () => infer T
      ? T & {
          activePlan?: { id: string; steps: unknown[] } | null;
          activeTask?: { planId?: string } | null;
        }
      : never;

    expect(state.activePlan).not.toBeNull();
    expect(state.activePlan?.steps.length).toBeGreaterThan(0);
    expect(state.activeTask?.planId).toBe(state.activePlan?.id);
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(String(promptSpy.mock.calls[0][0])).toContain("<execution_plan>");
    runtime.dispose();
  });

  it("hydrates the newest active plan and reactivates matching patterns on init", async () => {
    const activate = vi.fn(() => ({ dispose: vi.fn() }));
    const adapter = createAdapter({
      getReasoningPatterns: () => [
        {
          id: "word:format-preservation",
          name: "Format Preservation",
          apps: ["word"],
          defaultState: () => ({}),
          triggers: (classification, plan) =>
            classification.needsPlan &&
            Boolean(plan?.userRequest.toLowerCase().includes("format")),
          activate,
        },
      ],
    });

    const seed = new AgentRuntime(adapter);
    await seed.init();
    const sessionId = seed.getState().currentSession!.id;

    const stalePlan = {
      id: "plan-1",
      userRequest: "Old plan",
      mode: "auto" as const,
      status: "active" as const,
      steps: [],
      createdAt: 1,
      updatedAt: 1,
      classification: {
        complexity: "moderate" as const,
        risk: "medium" as const,
        needsPlan: true,
        rationale: "Old plan",
      },
      revisionNotes: [],
    };
    const freshPlan = {
      ...stalePlan,
      id: "plan-2",
      userRequest: "Verify the formatting after rewriting this section.",
      updatedAt: 2,
      classification: {
        complexity: "moderate" as const,
        risk: "medium" as const,
        needsPlan: true,
        rationale: "Fresh plan",
      },
    };

    await savePlanRecord(sessionId, stalePlan);
    await savePlanRecord(sessionId, freshPlan);
    await saveTaskRecord(sessionId, {
      id: "task-1",
      userRequest: freshPlan.userRequest,
      status: "in_progress",
      planId: freshPlan.id,
      toolCallIds: [],
      createdAt: 1,
      updatedAt: 2,
    });
    seed.dispose();

    const runtime = new AgentRuntime(adapter);
    await runtime.init();

    expect(runtime.getState().activePlan?.id).toBe("plan-2");
    expect(runtime.getState().activeTask?.planId).toBe("plan-2");
    expect((runtime as any).patternRegistry.getActivePatternIds()).toEqual([
      "word:format-preservation",
    ]);
    runtime.dispose();
  });

  it("clearMessages removes persisted plan and task state for the current session", async () => {
    const runtime = new AgentRuntime(createAdapter());
    await runtime.init();
    const sessionId = runtime.getState().currentSession!.id;

    await savePlanRecord(sessionId, {
      id: "plan-1",
      userRequest: "Rewrite and verify.",
      mode: "auto",
      status: "active",
      steps: [],
      createdAt: 1,
      updatedAt: 1,
      classification: {
        complexity: "moderate",
        risk: "medium",
        needsPlan: true,
        rationale: "Needs plan",
      },
      revisionNotes: [],
    });
    await saveTaskRecord(sessionId, {
      id: "task-1",
      userRequest: "Rewrite and verify.",
      status: "in_progress",
      planId: "plan-1",
      toolCallIds: [],
      createdAt: 1,
      updatedAt: 1,
    });

    runtime.clearMessages();
    await new Promise((resolve) => setTimeout(resolve, 0));
    runtime.dispose();

    const restored = new AgentRuntime(createAdapter());
    await restored.init();

    expect(restored.getState().activePlan).toBeNull();
    expect(restored.getState().activeTask).toBeNull();
    restored.dispose();
  });
});
