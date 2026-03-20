import type {
  ActionClass,
  HookTraceEntry,
  HostApp,
  HostScopeRef,
  TaskPhase,
} from "../orchestration/types";

export type HookStage =
  | "before_discuss"
  | "after_discuss"
  | "before_plan"
  | "after_plan"
  | "before_tool"
  | "after_tool"
  | "before_verify"
  | "after_verify"
  | "on_pause"
  | "on_resume"
  | "on_complete";

export interface ToolInvocationContext<TParams = unknown, TResult = unknown> {
  sessionId: string;
  hostApp: HostApp;
  toolName: string;
  actionClass: ActionClass;
  input: TParams;
  output?: TResult;
  readScopes: HostScopeRef[];
  deniedScopes: HostScopeRef[];
  phase: TaskPhase;
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
