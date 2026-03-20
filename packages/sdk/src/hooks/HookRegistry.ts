import type { HookTraceEntry } from "../orchestration/types";
import type {
  AfterToolRunResult,
  BeforeToolRunResult,
  ToolHook,
  ToolInvocationContext,
} from "./types";

function matchesHook(hook: ToolHook, ctx: ToolInvocationContext): boolean {
  if (hook.hostApps && !hook.hostApps.includes(ctx.hostApp)) return false;
  if (hook.tools && !hook.tools.includes(ctx.toolName)) return false;
  return true;
}

function traceEntry(
  hookId: string,
  stage: string,
  toolName: string,
  outcome: HookTraceEntry["outcome"],
  message?: string,
): HookTraceEntry {
  return {
    hookId,
    stage,
    toolName,
    outcome,
    message,
    at: new Date().toISOString(),
  };
}

export class HookRegistry {
  private readonly hooks: ToolHook[] = [];

  register(hook: ToolHook): void {
    this.hooks.push(hook);
  }

  private list(
    stage: ToolHook["stage"],
    ctx: ToolInvocationContext,
  ): ToolHook[] {
    return this.hooks
      .filter((hook) => hook.stage === stage && matchesHook(hook, ctx))
      .sort((left, right) => left.order - right.order);
  }

  async runBeforeTool<TParams>(
    ctx: ToolInvocationContext<TParams>,
  ): Promise<BeforeToolRunResult<TParams>> {
    let input = ctx.input;
    const trace: HookTraceEntry[] = [];

    for (const hook of this.list("before_tool", ctx)) {
      const decision = await hook.run({ ...ctx, input });
      if (decision.action === "abort") {
        trace.push(
          traceEntry(
            hook.id,
            hook.stage,
            ctx.toolName,
            "blocked",
            decision.reason,
          ),
        );
        return {
          blocked: true,
          reason: decision.reason,
          input,
          trace,
        };
      }
      if (decision.action === "patch_input") {
        input = decision.patchedInput as TParams;
      }
      trace.push(
        traceEntry(
          hook.id,
          hook.stage,
          ctx.toolName,
          decision.message ? "warned" : "continued",
          decision.message,
        ),
      );
    }

    return { blocked: false, input, trace };
  }

  async runAfterTool<TResult>(
    ctx: ToolInvocationContext<unknown, TResult>,
  ): Promise<AfterToolRunResult> {
    const trace: HookTraceEntry[] = [];
    for (const hook of this.list("after_tool", ctx)) {
      const decision = await hook.run(ctx);
      trace.push(
        traceEntry(
          hook.id,
          hook.stage,
          ctx.toolName,
          decision.action === "abort"
            ? "blocked"
            : decision.message
              ? "warned"
              : "continued",
          decision.action === "abort" ? decision.reason : decision.message,
        ),
      );
    }
    return { trace };
  }
}
