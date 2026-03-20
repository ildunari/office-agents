import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";
import { HookRegistry } from "../../src/hooks/registry";
import { wrapTool } from "../../src/hooks/tool-wrapper";
import { defineTool } from "../../src/tools/types";

describe("wrapTool", () => {
  it("preserves tool metadata and passes through to execute", async () => {
    const tool = defineTool({
      name: "get_document_text",
      label: "Get document text",
      description: "Reads document text.",
      parameters: Type.Object({
        startParagraph: Type.Optional(Type.Number()),
      }),
      execute: vi.fn(async () => ({
        content: [{ type: "text", text: "{\"ok\":true}" }],
        details: undefined,
      })),
    });

    const wrapped = wrapTool(tool, new HookRegistry());
    const result = await wrapped.execute("call-1", {});

    expect(wrapped.name).toBe(tool.name);
    expect(wrapped.label).toBe(tool.label);
    expect(wrapped.description).toBe(tool.description);
    expect(wrapped.parameters).toBe(tool.parameters);
    expect(tool.execute).toHaveBeenCalledWith("call-1", {}, undefined, undefined);
    expect(result.content[0]).toEqual({ type: "text", text: "{\"ok\":true}" });
  });

  it("returns an abort result without running the tool", async () => {
    const registry = new HookRegistry();
    const tool = defineTool({
      name: "set_cell_range",
      label: "Set cell range",
      description: "Writes values.",
      parameters: Type.Object({}),
      execute: vi.fn(async () => ({
        content: [{ type: "text", text: "{\"ok\":true}" }],
        details: undefined,
      })),
    });

    registry.registerPre({
      name: "abort",
      speed: "sync",
      source: { hookName: "abort" },
      execute: () => ({
        action: "abort",
        errorMessage: "blocked",
      }),
    });

    const result = await wrapTool(tool, registry).execute("call-2", {});

    expect(tool.execute).not.toHaveBeenCalled();
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ success: false, error: "blocked" }),
    });
  });
});
