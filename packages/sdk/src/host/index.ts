import type { HostApp } from "../orchestration/types";
import { excelHostAdapter } from "./excel";
import type { HostRuntimeAdapter } from "./types";
import { wordHostAdapter } from "./word";

const genericHostAdapter: HostRuntimeAdapter = {
  hostApp: "generic",
  classifyTool(toolName) {
    if (toolName === "update_plan") return "plan";
    return "neutral";
  },
  extractScopes() {
    return [];
  },
  canWriteWithReadSet(_toolName, _writeScopes, readScopes) {
    return readScopes.length > 0;
  },
};

export function getHostRuntimeAdapter(hostApp: HostApp): HostRuntimeAdapter {
  if (hostApp === "word") return wordHostAdapter;
  if (hostApp === "excel") return excelHostAdapter;
  return genericHostAdapter;
}
