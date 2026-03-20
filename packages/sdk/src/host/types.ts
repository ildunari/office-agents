import type { HostApp, HostScopeRef } from "../orchestration/types";

export type ToolIntent = "read" | "write" | "plan" | "neutral";

export interface HostRuntimeAdapter {
  hostApp: HostApp;
  classifyTool(toolName: string): ToolIntent;
  extractScopes(
    toolName: string,
    params: Record<string, unknown>,
  ): HostScopeRef[];
  canWriteWithReadSet(
    toolName: string,
    writeScopes: HostScopeRef[],
    readScopes: HostScopeRef[],
  ): boolean;
}
