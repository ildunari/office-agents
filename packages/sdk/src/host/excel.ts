import type { HostScopeRef } from "../orchestration/types";
import type { HostRuntimeAdapter } from "./types";

function sheetScope(sheetId: number, range?: string): HostScopeRef {
  return {
    kind: range ? "excel.range" : "excel.sheet",
    ref: range ? `${sheetId}:${range}` : String(sheetId),
  };
}

export const excelHostAdapter: HostRuntimeAdapter = {
  hostApp: "excel",
  classifyAction(toolName) {
    if (toolName === "update_plan") return "plan";
    if (
      toolName === "get_cell_ranges" ||
      toolName === "get_range_as_csv" ||
      toolName === "search_data" ||
      toolName === "screenshot_range" ||
      toolName === "get_all_objects"
    ) {
      return "read";
    }
    if (toolName === "read_file" || toolName === "bash") {
      return "external_io";
    }
    if (toolName === "set_cell_range" || toolName === "copy_to") {
      return "benign_write";
    }
    if (
      toolName === "clear_cell_range" ||
      toolName === "modify_sheet_structure" ||
      toolName === "modify_workbook_structure" ||
      toolName === "resize_range"
    ) {
      return "structural_write";
    }
    if (toolName === "modify_object") return "destructive_write";
    if (toolName === "eval_officejs") return "unsafe_eval";
    return "neutral";
  },
  extractScopes(toolName, params) {
    const sheetId = Number(params.sheetId ?? -1);
    if (toolName === "get_cell_ranges") {
      const ranges = Array.isArray(params.ranges) ? params.ranges : [];
      return ranges.map((range) => sheetScope(sheetId, String(range)));
    }
    if (typeof params.range === "string") {
      return [sheetScope(sheetId, params.range)];
    }
    if (sheetId >= 0) {
      return [sheetScope(sheetId)];
    }
    return [{ kind: "excel.workbook", ref: "workbook" }];
  },
  canWriteWithReadSet(_toolName, writeScopes, readScopes) {
    if (readScopes.length === 0) return false;
    if (writeScopes.length === 0) return true;
    const writePrefixes = new Set(
      writeScopes.map((scope) => scope.ref.split(":")[0]),
    );
    return readScopes.some((scope) =>
      writePrefixes.has(scope.ref.split(":")[0]),
    );
  },
  isDeniedScope(scope) {
    return scope.kind.includes("hidden") || scope.ref.includes("protected");
  },
};
