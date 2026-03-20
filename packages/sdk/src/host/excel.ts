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
  classifyTool(toolName) {
    if (toolName === "update_plan") return "plan";
    if (
      toolName === "get_cell_ranges" ||
      toolName === "get_range_as_csv" ||
      toolName === "search_data" ||
      toolName === "screenshot_range" ||
      toolName === "get_all_objects" ||
      toolName === "read_file" ||
      toolName === "bash"
    ) {
      return "read";
    }
    if (
      toolName === "set_cell_range" ||
      toolName === "clear_cell_range" ||
      toolName === "copy_to" ||
      toolName === "modify_sheet_structure" ||
      toolName === "modify_workbook_structure" ||
      toolName === "resize_range" ||
      toolName === "modify_object" ||
      toolName === "eval_officejs"
    ) {
      return "write";
    }
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
};
