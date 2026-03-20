import type {
  HookTraceEntry,
  HostApp,
  HostScopeRef,
} from "../orchestration/types";

export type HookStage = "before_tool" | "after_tool";

export interface ToolInvocationContext<TParams = unknown, TResult = unknown> {
  sessionId: string;
  hostApp: HostApp;
  toolName: string;
  input: TParams;
  output?: TResult;
  readScopes: HostScopeRef[];
}

export type HookDecision =
  | {
      action: "continue";
      message?: string;
    }
  | {
      action: "patch_input";
      patchedInput: unknown;
      message?: string;
    }
  | {
      action: "abort";
      reason: string;
    };

export interface ToolHook {
  id: string;
  stage: HookStage;
  order: number;
  tools?: string[];
  hostApps?: HostApp[];
  run(ctx: ToolInvocationContext): Promise<HookDecision> | HookDecision;
}

export interface BeforeToolRunResult<TParams = unknown> {
  blocked: boolean;
  reason?: string;
  input: TParams;
  trace: HookTraceEntry[];
}

export interface AfterToolRunResult {
  trace: HookTraceEntry[];
}
