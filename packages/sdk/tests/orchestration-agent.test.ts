import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { createUpdatePlanTool } from "../src/planning/update-plan-tool";
import { AgentOrchestrator } from "../src/orchestration/AgentOrchestrator";
import { defineTool, toolSuccess } from "../src/tools/types";

describe("AgentOrchestrator", () => {
  it("starts broad mutating requests in discuss phase before execution", () => {
    const orchestrator = new AgentOrchestrator({
      hostApp: "word",
      sessionId: "session-discuss",
      documentKey: "doc-discuss",
    });

    orchestrator.beginPrompt(
      "Rewrite the entire contract, reorganize it, and clean up formatting throughout the document.",
    );

    expect(orchestrator.getState().phase).toBe("discuss");
  });

  it("adds a stable update_plan tool alongside wrapped host tools", () => {
    const orchestrator = new AgentOrchestrator({
      hostApp: "word",
      sessionId: "session-1",
      documentKey: "doc-1",
    });

    const tools = orchestrator.wrapTools([
      defineTool({
        name: "get_document_text",
        label: "Get document text",
        description: "read",
        parameters: Type.Object({}),
        execute: async () => toolSuccess({ ok: true }),
      }),
    ]);

    expect(tools.map((tool) => tool.name)).toEqual([
      "get_document_text",
      "update_plan",
    ]);
    expect(createUpdatePlanTool(() => {}).name).toBe("update_plan");
  });

  it("blocks Word writes before any scoped read has happened", async () => {
    let writeCalls = 0;
    const orchestrator = new AgentOrchestrator({
      hostApp: "word",
      sessionId: "session-2",
      documentKey: "doc-2",
      permissionMode: "full_auto",
    });

    const [writeTool] = orchestrator.wrapTools([
      defineTool({
        name: "execute_office_js",
        label: "Execute Office.js",
        description: "write",
        parameters: Type.Object({
          code: Type.String(),
        }),
        execute: async () => {
          writeCalls += 1;
          return toolSuccess({ ok: true });
        },
      }),
    ]);

    const result = await writeTool.execute("call-1", {
      code: "context.document.body.insertText('hi', 'Start')",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(writeCalls).toBe(0);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Read the target scope first");
  });

  it("allows writes after a compatible Word read", async () => {
    let writeCalls = 0;
    const orchestrator = new AgentOrchestrator({
      hostApp: "word",
      sessionId: "session-3",
      documentKey: "doc-3",
      permissionMode: "full_auto",
    });

    const [readTool, writeTool] = orchestrator.wrapTools([
      defineTool({
        name: "get_document_text",
        label: "Get document text",
        description: "read",
        parameters: Type.Object({
          startParagraph: Type.Optional(Type.Number()),
          endParagraph: Type.Optional(Type.Number()),
        }),
        execute: async () =>
          toolSuccess({
            totalParagraphs: 10,
            showing: { start: 0, end: 2 },
            paragraphs: [],
          }),
      }),
      defineTool({
        name: "execute_office_js",
        label: "Execute Office.js",
        description: "write",
        parameters: Type.Object({
          code: Type.String(),
        }),
        execute: async () => {
          writeCalls += 1;
          return toolSuccess({ ok: true });
        },
      }),
    ]);

    await readTool.execute("call-1", { startParagraph: 0, endParagraph: 2 });
    const result = await writeTool.execute("call-2", {
      code: "context.document.body.insertText('hi', 'Start')",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(writeCalls).toBe(1);
    expect(payload.ok).toBe(true);
  });

  it("moves risky actions into waiting_on_user when permission mode requires approval", async () => {
    const orchestrator = new AgentOrchestrator({
      hostApp: "excel",
      sessionId: "session-4",
      documentKey: "doc-4",
      permissionMode: "confirm_risky",
    });

    const [tool] = orchestrator.wrapTools([
      defineTool({
        name: "eval_officejs",
        label: "Eval Office.js",
        description: "unsafe",
        parameters: Type.Object({
          code: Type.String(),
        }),
        execute: async () => toolSuccess({ ok: true }),
      }),
    ]);

    const result = await tool.execute("call-risky", {
      code: "context.workbook.worksheets.getActiveWorksheet().getRange('A1').values = [['x']]",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(orchestrator.getState().phase).toBe("waiting_on_user");
    expect(orchestrator.getState().waitingState?.kind).toBe("approval");
  });
});
