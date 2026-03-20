import type {
  ActionClass,
  HostApp,
  HostScopeRef,
} from "../orchestration/types";

export interface HostRuntimeAdapter {
  hostApp: HostApp;
  classifyAction(toolName: string): ActionClass;
  extractScopes(
    toolName: string,
    params: Record<string, unknown>,
  ): HostScopeRef[];
  canWriteWithReadSet(
    toolName: string,
    writeScopes: HostScopeRef[],
    readScopes: HostScopeRef[],
  ): boolean;
  isDeniedScope(scope: HostScopeRef): boolean;
}
