import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRuntime, type RuntimeAdapter } from "../src/runtime";
import { configureNamespace } from "../src/storage/namespace";

let nsCounter = 0;
let currentDbName = "";

function freshNamespace() {
  nsCounter += 1;
  currentDbName = `RuntimeHooksTestDB_${nsCounter}`;
  configureNamespace({
    dbName: currentDbName,
    dbVersion: 1,
    localStoragePrefix: `runtime-hooks-test-${nsCounter}`,
    documentSettingsPrefix: `runtime-hooks-test-${nsCounter}`,
    documentIdSettingsKey: `runtime-hooks-test-${nsCounter}-document-id`,
  });
}

function createAdapter(
  overrides: Partial<RuntimeAdapter> = {},
): RuntimeAdapter {
  return {
    tools: [],
    buildSystemPrompt: () => "You are a test assistant.",
    getDocumentId: async () => "doc-hooks-test",
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

describe("AgentRuntime hook integration", () => {
  beforeEach(() => {
    freshNamespace();
  });

  afterEach(async () => {
    await deleteCurrentDb();
  });

  it("registers adapter hooks once and does not re-register on applyConfig", () => {
    const registerHooks = vi.fn();
    const runtime = new AgentRuntime(createAdapter({ registerHooks }));

    expect(registerHooks).toHaveBeenCalledTimes(1);

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

    runtime.applyConfig({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      useProxy: false,
      proxyUrl: "",
      thinking: "none",
      followMode: false,
      expandToolCalls: true,
    });

    expect(registerHooks).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("resets hook session state when clearing messages", () => {
    const runtime = new AgentRuntime(createAdapter());
    const hookRegistry = (runtime as any).hookRegistry;

    hookRegistry.getSessionState().readScopes.add("word:all");
    runtime.clearMessages();

    expect(hookRegistry.getSessionState().readScopes.size).toBe(0);
    runtime.dispose();
  });

  it("resets hook session state when starting a new session", async () => {
    const runtime = new AgentRuntime(createAdapter());
    await runtime.init();
    const hookRegistry = (runtime as any).hookRegistry;

    hookRegistry.getSessionState().readScopes.add("excel:Sheet1:A1");
    await runtime.newSession();

    expect(hookRegistry.getSessionState().readScopes.size).toBe(0);
    runtime.dispose();
  });
});
