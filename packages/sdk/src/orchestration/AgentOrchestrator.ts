import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Static, TObject } from "@sinclair/typebox";
import { HookRegistry } from "../hooks/HookRegistry";
import type { ToolInvocationContext } from "../hooks/types";
import { getHostRuntimeAdapter } from "../host";
import type { HostRuntimeAdapter } from "../host/types";
import { generateId } from "../message-utils";
import { classifyTask } from "../planning/classifier";
import { PlanManager } from "../planning/PlanManager";
import { createUpdatePlanTool } from "../planning/update-plan-tool";
import { toolError } from "../tools/types";
import type {
  ExecutionPlan,
  HostApp,
  HostScopeRef,
  OrchestratorState,
  TaskRecord,
  UpdatePlanInput,
} from "./types";

interface AgentOrchestratorOptions {
  hostApp: HostApp;
  sessionId: string;
  documentKey: string;
  onStateChange?: (state: OrchestratorState) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createTask(
  options: AgentOrchestratorOptions,
  prompt: string,
): { task: TaskRecord; plan: ExecutionPlan } {
  const classification = classifyTask({
    hostApp: options.hostApp,
    prompt,
  });
  const task: TaskRecord = {
    id: generateId(),
    sessionId: options.sessionId,
    hostApp: options.hostApp,
    documentKey: options.documentKey,
    prompt,
    status: classification.requiresApprovalBeforeMutation
      ? "awaiting_approval"
      : "executing",
    classification,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const plan = new PlanManager().createPlan({
    taskId: task.id,
    hostApp: options.hostApp,
    prompt,
    classification,
  });
  task.planId = plan.id;
  return { task, plan };
}

function errorResult(message: string) {
  return toolError(message);
}

export class AgentOrchestrator {
  private readonly hostAdapter: HostRuntimeAdapter;
  private readonly hookRegistry = new HookRegistry();
  private readonly planManager = new PlanManager();
  private readonly readScopes: HostScopeRef[] = [];
  private state: OrchestratorState = {
    activeTask: null,
    plan: null,
    approvalRequest: null,
    undoLog: [],
    contextBudget: null,
    hookTrace: [],
  };

  constructor(private readonly options: AgentOrchestratorOptions) {
    this.hostAdapter = getHostRuntimeAdapter(options.hostApp);
    this.registerCoreHooks();
  }

  getState(): OrchestratorState {
    return this.state;
  }

  hydrateState(state: OrchestratorState | null): void {
    if (!state) return;
    this.state = state;
    this.emitState();
  }

  getSystemPromptPreamble(): string {
    if (this.options.hostApp === "generic") return "";
    return [
      "## Shared Agent Loop Rules",
      "- Use `update_plan` for multi-step work before broad mutations.",
      "- Read the target scope before mutating it.",
      "- Preserve existing structure and formatting unless the user explicitly asked to change them.",
      "- Validate important mutations after writes and mention remaining warnings in the final answer.",
    ].join("\n");
  }

  beginPrompt(prompt: string): void {
    const { task, plan } = createTask(this.options, prompt);
    this.state = {
      ...this.state,
      activeTask: task,
      plan,
      approvalRequest: task.classification.requiresApprovalBeforeMutation
        ? {
            reason:
              "High-risk mutation requires approval before document changes.",
            uiMessage:
              "This request looks broad or destructive. Review the plan before allowing writes.",
          }
        : null,
    };
    this.emitState();
  }

  applyPlanUpdate(update: UpdatePlanInput): ExecutionPlan | null {
    if (!this.state.plan) return null;
    const plan = this.planManager.applyUpdate(this.state.plan, update);
    this.state = { ...this.state, plan };
    this.emitState();
    return plan;
  }

  private registerCoreHooks(): void {
    this.hookRegistry.register({
      id: "core.read-before-write",
      stage: "before_tool",
      order: 10,
      hostApps: ["word", "excel"],
      run: (ctx) => {
        if (this.hostAdapter.classifyTool(ctx.toolName) !== "write") {
          return { action: "continue" };
        }
        const writeScopes = this.hostAdapter.extractScopes(
          ctx.toolName,
          ctx.input as Record<string, unknown>,
        );
        if (
          !this.hostAdapter.canWriteWithReadSet(
            ctx.toolName,
            writeScopes,
            this.readScopes,
          )
        ) {
          return {
            action: "abort",
            reason:
              "Read the target scope first before mutating it. Capture a scoped read, then retry the write.",
          };
        }
        return { action: "continue" };
      },
    });
  }

  private appendTrace(entries: OrchestratorState["hookTrace"]): void {
    if (entries.length === 0) return;
    this.state = {
      ...this.state,
      hookTrace: [...this.state.hookTrace, ...entries].slice(-50),
    };
    this.emitState();
  }

  private recordRead(toolName: string, params: Record<string, unknown>): void {
    const scopes = this.hostAdapter.extractScopes(toolName, params);
    if (scopes.length === 0) return;
    this.readScopes.push(...scopes);
    this.emitState();
  }

  private emitState(): void {
    this.options.onStateChange?.(this.state);
  }

  wrapTools(tools: AgentTool[]): AgentTool[] {
    const wrapped = tools.map((tool) => this.wrapTool(tool));
    wrapped.push(createUpdatePlanTool((input) => this.applyPlanUpdate(input)));
    return wrapped;
  }

  private wrapTool(tool: AgentTool): AgentTool {
    if (tool.name === "update_plan") return tool;
    return {
      ...tool,
      execute: async (
        toolCallId: string,
        params: Static<TObject>,
        signal?: AbortSignal,
        onUpdate?: Parameters<AgentTool["execute"]>[3],
      ) => {
        const beforeCtx: ToolInvocationContext<Record<string, unknown>> = {
          sessionId: this.options.sessionId,
          hostApp: this.options.hostApp,
          toolName: tool.name,
          input: params as Record<string, unknown>,
          readScopes: [...this.readScopes],
        };
        const before = await this.hookRegistry.runBeforeTool(beforeCtx);
        this.appendTrace(before.trace);
        if (before.blocked) {
          return errorResult(before.reason ?? "Tool call blocked by hook.");
        }

        const result = await tool.execute(
          toolCallId,
          before.input as Static<TObject>,
          signal,
          onUpdate,
        );

        if (this.hostAdapter.classifyTool(tool.name) === "read") {
          this.recordRead(tool.name, before.input as Record<string, unknown>);
        }

        const after = await this.hookRegistry.runAfterTool({
          ...beforeCtx,
          input: before.input,
          output: result,
          readScopes: [...this.readScopes],
        });
        this.appendTrace(after.trace);
        return result;
      },
    };
  }
}
