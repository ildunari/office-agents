import { describe, expect, it } from "vitest";
import {
  readBeforeWritePostHook,
  readBeforeWritePreHook,
} from "../../src/hooks/builtins/read-before-write";
import type {
  PostHookContext,
  PreHookContext,
  PreHookResult,
} from "../../src/hooks/types";

function createSessionState() {
  return {
    readScopes: new Set<string>(),
    formatFingerprints: new Map<string, string>(),
    custom: new Map<string, unknown>(),
  };
}

function createPreContext(toolName: string, params: Record<string, unknown> = {}): PreHookContext {
  return {
    toolName,
    tags: ["write"],
    params,
    toolCallId: "pre-1",
    budget: { totalMs: 1000, elapsedMs: 0 },
    captures: new Map<string, unknown>(),
    sessionState: createSessionState(),
  };
}

function createPostContext(
  toolName: string,
  params: Record<string, unknown> = {},
): PostHookContext {
  return {
    toolName,
    tags: ["read"],
    params,
    result: {
      content: [{ type: "text", text: "{\"ok\":true}" }],
      details: undefined,
    },
    isError: false,
    toolCallId: "post-1",
    budget: { totalMs: 1000, elapsedMs: 0 },
    captures: new Map<string, unknown>(),
    sessionState: createSessionState(),
  };
}

describe("readBeforeWrite hooks", () => {
  it("blocks writes until a matching read scope has been recorded", async () => {
    const ctx = createPreContext("execute_office_js");
    const result = (await readBeforeWritePreHook.execute(ctx)) as PreHookResult;

    expect(result.action).toBe("abort");
    expect(result.errorMessage).toContain("read the target content");
  });

  it("records successful reads and allows later writes", async () => {
    const postCtx = createPostContext("get_document_text", {
      startParagraph: 0,
      endParagraph: 10,
    });
    await readBeforeWritePostHook.execute(postCtx);

    const preCtx = {
      ...createPreContext("execute_office_js"),
      sessionState: postCtx.sessionState,
    };
    const result = (await readBeforeWritePreHook.execute(preCtx)) as PreHookResult;

    expect(result.action).toBe("continue");
  });
});
