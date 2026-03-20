import type { HostScopeRef } from "../orchestration/types";
import type { HostRuntimeAdapter } from "./types";

function toParagraphScope(params: Record<string, unknown>): HostScopeRef {
  const start = Number(params.startParagraph ?? 0);
  const rawEnd = params.endParagraph;
  const end = Number(rawEnd ?? start + 1);
  return {
    kind: "word.paragraph_range",
    ref: `${start}:${end}`,
  };
}

export const wordHostAdapter: HostRuntimeAdapter = {
  hostApp: "word",
  classifyTool(toolName) {
    if (toolName === "update_plan") return "plan";
    if (
      toolName === "get_document_text" ||
      toolName === "get_document_structure" ||
      toolName === "get_ooxml" ||
      toolName === "screenshot_document" ||
      toolName === "read_file" ||
      toolName === "bash"
    ) {
      return "read";
    }
    if (toolName === "execute_office_js") return "write";
    return "neutral";
  },
  extractScopes(toolName, params) {
    if (toolName === "get_document_text") {
      return [toParagraphScope(params)];
    }
    if (toolName === "get_ooxml") {
      const startChild = Number(params.startChild ?? 0);
      const rawEndChild = params.endChild;
      const endChild = Number(rawEndChild ?? startChild + 1);
      return [
        {
          kind: "word.body_child_range",
          ref: `${startChild}:${endChild}`,
        },
      ];
    }
    return [{ kind: "word.document", ref: "document" }];
  },
  canWriteWithReadSet(_toolName, _writeScopes, readScopes) {
    return readScopes.length > 0;
  },
};
