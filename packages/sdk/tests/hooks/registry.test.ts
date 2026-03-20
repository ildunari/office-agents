import { describe, expect, it, vi } from "vitest";
import { HookRegistry } from "../../src/hooks/registry";
import type {
  PostHookDefinition,
  PreHookDefinition,
  PreHookResult,
  ToolTag,
} from "../../src/hooks/types";

const NOOP_SOURCE = { hookName: "test-hook" };

function createPreHook(
  name: string,
  options: Partial<PreHookDefinition> = {},
): PreHookDefinition {
  return {
    name,
    speed: "sync",
    source: NOOP_SOURCE,
    execute: () => ({ action: "continue" }),
    ...options,
  };
}

function createPreContext(tags: ToolTag[] = ["read"]) {
  return {
    toolName: "get_document_text",
    tags,
    params: {},
    toolCallId: "tc-1",
    budget: { totalMs: 1000, elapsedMs: 0 },
    captures: new Map<string, unknown>(),
    sessionState: {
      readScopes: new Set<string>(),
      formatFingerprints: new Map<string, string>(),
      custom: new Map<string, unknown>(),
    },
  };
}

describe("HookRegistry", () => {
  it("runs hooks in band and priority order", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    const push = (name: string): PreHookResult => {
      calls.push(name);
      return { action: "continue" };
    };

    registry.registerPre(
      createPreHook("late", {
        band: "late",
        execute: () => push("late"),
      }),
    );
    registry.registerPre(
      createPreHook("default-low", {
        band: "default",
        priority: 1,
        execute: () => push("default-low"),
      }),
    );
    registry.registerPre(
      createPreHook("early", {
        band: "early",
        execute: () => push("early"),
      }),
    );
    registry.registerPre(
      createPreHook("default-high", {
        band: "default",
        priority: 100,
        execute: () => push("default-high"),
      }),
    );

    await registry.runPreHooks(createPreContext());

    expect(calls).toEqual(["early", "default-high", "default-low", "late"]);
  });

  it("respects after dependencies in same band", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    registry.registerPre(
      createPreHook("a", {
        band: "default",
        execute: () => {
          calls.push("a");
          return { action: "continue" };
        },
      }),
    );
    registry.registerPre(
      createPreHook("b", {
        band: "default",
        after: ["a"],
        execute: () => {
          calls.push("b");
          return { action: "continue" };
        },
      }),
    );

    await registry.runPreHooks(createPreContext());
    expect(calls).toEqual(["a", "b"]);
  });

  it("filters hooks by selector", async () => {
    const registry = new HookRegistry();
    const spy = vi.fn(() => ({ action: "continue" as const }));

    registry.registerPre(
      createPreHook("only-writes", {
        selector: { tags: ["write"] },
        execute: spy,
      }),
    );

    await registry.runPreHooks(createPreContext(["read"]));
    expect(spy).not.toHaveBeenCalled();

    await registry.runPreHooks(createPreContext(["write"]));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("disables a hook after repeated failures", async () => {
    const registry = new HookRegistry();
    const failingHook = createPreHook("failing", {
      onFailure: "ignore",
      execute: () => {
        throw new Error("boom");
      },
    });

    registry.registerPre(failingHook);

    await registry.runPreHooks(createPreContext());
    await registry.runPreHooks(createPreContext());
    await registry.runPreHooks(createPreContext());

    const fourth = await registry.runPreHooks(createPreContext());
    expect(fourth.action).toBe("continue");
  });

  it("can dispose registered hooks", async () => {
    const registry = new HookRegistry();
    const spy = vi.fn(() => ({ action: "continue" as const }));

    const disposable = registry.registerPre(
      createPreHook("disposable", { execute: spy }),
    );

    await registry.runPreHooks(createPreContext());
    expect(spy).toHaveBeenCalledTimes(1);

    disposable.dispose();
    await registry.runPreHooks(createPreContext());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("resets session state and prompt notes", () => {
    const registry = new HookRegistry();
    registry.getSessionState().readScopes.add("word:all");
    registry.addPromptNotes([
      {
        level: "info",
        text: "note",
        source: { hookName: "a" },
      },
    ]);

    registry.resetSessionState();

    expect(registry.getSessionState().readScopes.size).toBe(0);
    expect(registry.drainPromptNotes()).toEqual([]);
  });

  it("runs post hooks with ordering and result override", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    const baseResult = {
      content: [{ type: "text" as const, text: "{\"ok\":true}" }],
      details: undefined,
    };

    const first: PostHookDefinition = {
      name: "first",
      band: "default",
      speed: "sync",
      source: NOOP_SOURCE,
      execute: () => {
        calls.push("first");
        return {};
      },
    };

    const second: PostHookDefinition = {
      name: "second",
      band: "default",
      after: ["first"],
      speed: "sync",
      source: NOOP_SOURCE,
      execute: () => {
        calls.push("second");
        return {
          modifiedResult: {
            content: [{ type: "text", text: "{\"ok\":false}" }],
            details: undefined,
          },
        };
      },
    };

    registry.registerPost(first);
    registry.registerPost(second);

    const result = await registry.runPostHooks({
      toolName: "set_cell_range",
      tags: ["write"],
      params: {},
      result: baseResult,
      isError: false,
      toolCallId: "tc-1",
      budget: { totalMs: 1000, elapsedMs: 0 },
      captures: new Map<string, unknown>(),
      sessionState: registry.getSessionState(),
    });

    expect(calls).toEqual(["first", "second"]);
    expect(result.modifiedResult?.content[0]).toEqual({
      type: "text",
      text: "{\"ok\":false}",
    });
  });
});
