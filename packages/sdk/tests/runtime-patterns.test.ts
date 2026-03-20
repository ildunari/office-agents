import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRuntime, type RuntimeAdapter } from "../src/runtime";
import { configureNamespace } from "../src/storage/namespace";

let nsCounter = 0;
let currentDbName = "";

function freshNamespace() {
  nsCounter += 1;
  currentDbName = `RuntimePatternsTestDB_${nsCounter}`;
  configureNamespace({
    dbName: currentDbName,
    dbVersion: 2,
    localStoragePrefix: `runtime-patterns-test-${nsCounter}`,
    documentSettingsPrefix: `runtime-patterns-test-${nsCounter}`,
    documentIdSettingsKey: `runtime-patterns-test-${nsCounter}-document-id`,
  });
}

function createAdapter(
  overrides: Partial<RuntimeAdapter> = {},
): RuntimeAdapter {
  return {
    tools: [],
    buildSystemPrompt: () => "You are a test assistant.",
    getDocumentId: async () => "doc-patterns-test",
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

describe("AgentRuntime pattern integration", () => {
  beforeEach(() => {
    freshNamespace();
  });

  afterEach(async () => {
    await deleteCurrentDb();
  });

  it("activates matching adapter-provided reasoning patterns for planned requests", async () => {
    const activate = vi.fn(() => ({ dispose: vi.fn() }));
    const runtime = new AgentRuntime(
      createAdapter({
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

    await runtime.sendMessage(
      "Read the current section, rewrite it, then verify the formatting carefully.",
    );

    expect(activate).toHaveBeenCalledTimes(1);
    expect((runtime as any).patternRegistry.getActivePatternIds()).toEqual([
      "word:format-preservation",
    ]);
    runtime.dispose();
  });
});
