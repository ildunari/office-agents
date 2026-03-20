import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Static, TObject } from "@sinclair/typebox";
import { HookRegistry } from "../hooks/HookRegistry";
import { shouldPauseForAction } from "../hooks/permission-policy";
import type { ToolInvocationContext } from "../hooks/types";
import { getHostRuntimeAdapter } from "../host";
import type { HostRuntimeAdapter } from "../host/types";
import { generateId } from "../message-utils";
import { classifyTask } from "../planning/classifier";
import { PlanManager } from "../planning/PlanManager";
import { PlanReviewer } from "../planning/PlanReviewer";
import { createUpdatePlanTool } from "../planning/update-plan-tool";
import { ReflectionEngine } from "../reflection/ReflectionEngine";
import { RetryLedger } from "../reflection/RetryLedger";
import { toolError } from "../tools/types";
import type {
  ApprovalRequest,
  ExecutionPlan,
  HandoffState,
  HostApp,
  HostScopeRef,
  LearnedMemory,
  OrchestratorState,
  PermissionMode,
  TaskPhase,
  TaskRecord,
  UpdatePlanInput,
  WaitingState,
  WorkspaceGuidance,
} from "./types";

interface AgentOrchestratorOptions {
  hostApp: HostApp;
  sessionId: string;
  documentKey: string;
  permissionMode?: PermissionMode;
  onStateChange?: (state: OrchestratorState) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createWorkspaceGuidance(): WorkspaceGuidance {
  return { version: 1, notes: [], updatedAt: nowIso() };
}

function createLearnedMemory(): LearnedMemory {
  return { version: 1, entries: [] };
}

function errorResult(message: string) {
  return toolError(message);
}

export class AgentOrchestrator {
  private readonly hostAdapter: HostRuntimeAdapter;
  private readonly hookRegistry = new HookRegistry();
  private readonly planManager = new PlanManager();
  private readonly planReviewer = new PlanReviewer();
  private readonly reflectionEngine = new ReflectionEngine();
  private readonly retryLedger = new RetryLedger();
  private readonly readScopes: HostScopeRef[] = [];
  private state: OrchestratorState;

  constructor(private readonly options: AgentOrchestratorOptions) {
    this.hostAdapter = getHostRuntimeAdapter(options.hostApp);
    this.state = {
      activeTask: null,
      plan: null,
      phase: "discuss",
      permissionMode: options.permissionMode ?? "confirm_risky",
      approvalRequest: null,
      waitingState: null,
      retryLedger: [],
      handoff: null,
      workspaceGuidance: createWorkspaceGuidance(),
      learnedMemory: createLearnedMemory(),
      undoLog: [],
      contextBudget: null,
      hookTrace: [],
    };
    this.registerCoreHooks();
  }

  getState(): OrchestratorState {
    return this.state;
  }

  hydrateState(state: OrchestratorState | null): void {
    if (!state) return;
    this.state = state;
    this.retryLedger.hydrate(state.retryLedger);
    this.emitState();
  }

  getSystemPromptPreamble(): string {
    if (this.options.hostApp === "generic") return "";
    return [
      "## Shared Agent Loop Rules",
      "- Use `update_plan` for multi-step work before broad mutations.",
      "- Respect the current permission mode before choosing risky actions.",
      "- Read the target scope before mutating it.",
      "- Preserve existing structure and formatting unless the user explicitly asked to change them.",
      "- Validate important mutations after writes and mention remaining warnings in the final answer.",
    ].join("\n");
  }

  setPermissionMode(mode: PermissionMode): void {
    this.state = { ...this.state, permissionMode: mode };
    this.emitState();
  }

  approveWaiting(): void {
    if (!this.state.waitingState) return;
    this.state = {
      ...this.state,
      phase: "execute",
      waitingState: null,
      approvalRequest: null,
      handoff: null,
    };
    this.emitState();
  }

  beginPrompt(prompt: string): void {
    const classification = classifyTask({
      hostApp: this.options.hostApp,
      prompt,
    });

    const task: TaskRecord = {
      id: generateId(),
      sessionId: this.options.sessionId,
      hostApp: this.options.hostApp,
      documentKey: this.options.documentKey,
      prompt,
      status: classification.requiresApprovalBeforeMutation
        ? "awaiting_approval"
        : "executing",
      classification,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const plan = classification.mutatesDocument
      ? this.planManager.createPlan({
          taskId: task.id,
          hostApp: this.options.hostApp,
          prompt,
          classification,
        })
      : null;

    const planReview = plan ? this.planReviewer.review(plan) : null;
    const phase = this.determineInitialPhase(
      classification,
      planReview?.status,
    );

    this.state = {
      ...this.state,
      activeTask: task,
      plan,
      phase,
      approvalRequest:
        phase === "waiting_on_user" &&
        classification.requiresApprovalBeforeMutation
          ? this.createApprovalRequest(
              "High-risk mutation requires approval before document changes.",
              "unsafe_eval",
              classification.targetScopes,
            )
          : null,
      waitingState:
        phase === "waiting_on_user" &&
        classification.requiresApprovalBeforeMutation
          ? this.createWaitingState(
              "approval",
              "High-risk mutation requires approval before document changes.",
              "Review the plan and approve the risky action to continue.",
              "unsafe_eval",
              classification.targetScopes,
            )
          : null,
      handoff:
        phase === "waiting_on_user"
          ? this.createHandoff(
              task.id,
              phase,
              "Review the plan and approve the risky action to continue.",
            )
          : null,
    };
    this.emitState();
  }

  applyPlanUpdate(update: UpdatePlanInput): ExecutionPlan | null {
    if (!this.state.plan) return null;
    const plan = this.planManager.applyUpdate(this.state.plan, update);
    const review = this.planReviewer.review(plan);
    this.state = {
      ...this.state,
      plan,
      phase: review.status === "pass" ? "execute" : "plan_review",
      waitingState:
        review.status === "fail"
          ? this.createWaitingState(
              "clarification",
              review.issues.join(" "),
              "Refine the plan before execution can continue.",
            )
          : null,
      handoff:
        review.status === "fail"
          ? this.createHandoff(
              plan.taskId,
              "waiting_on_user",
              "Refine the plan before execution can continue.",
            )
          : null,
    };
    this.emitState();
    return plan;
  }

  private determineInitialPhase(
    classification: TaskRecord["classification"],
    reviewStatus?: "pass" | "fail",
  ): TaskPhase {
    if (classification.requiresDiscussion) return "discuss";
    if (classification.mutatesDocument) {
      if (classification.requiresApprovalBeforeMutation)
        return "waiting_on_user";
      if (reviewStatus === "fail") return "plan_review";
      return "execute";
    }
    return "execute";
  }

  private createApprovalRequest(
    reason: string,
    actionClass?: ApprovalRequest["actionClass"],
    scopes?: HostScopeRef[],
  ): ApprovalRequest {
    return {
      reason,
      uiMessage: reason,
      actionClass,
      scopes,
    };
  }

  private createWaitingState(
    kind: WaitingState["kind"],
    reason: string,
    resumeMessage: string,
    actionClass?: WaitingState["actionClass"],
    scopes?: HostScopeRef[],
  ): WaitingState {
    return {
      kind,
      reason,
      resumeMessage,
      actionClass,
      scopes,
      createdAt: nowIso(),
    };
  }

  private createHandoff(
    taskId: string,
    phase: TaskPhase,
    resumeMessage: string,
  ): HandoffState {
    let lastCompletedStepId: string | undefined;
    const steps = this.state.plan?.steps ?? [];
    for (let index = steps.length - 1; index >= 0; index--) {
      if (steps[index].status === "completed") {
        lastCompletedStepId = steps[index].id;
        break;
      }
    }
    return {
      taskId,
      phase,
      resumeMessage,
      lastCompletedStepId,
      updatedAt: nowIso(),
    };
  }

  private updateRetryLedger(
    stepId: string,
    issueSignature: string,
    approachHash: string,
  ) {
    const decision = this.retryLedger.record(
      stepId,
      issueSignature,
      approachHash,
    );
    this.state = {
      ...this.state,
      retryLedger: this.retryLedger.snapshot(),
    };
    return decision;
  }

  private registerCoreHooks(): void {
    this.hookRegistry.register({
      id: "core.permission-gate",
      stage: "before_tool",
      order: 5,
      hostApps: ["word", "excel", "generic"],
      run: (ctx) => {
        const denied = ctx.readScopes.some((scope) =>
          this.hostAdapter.isDeniedScope(scope),
        );
        const decision = shouldPauseForAction(
          this.state.permissionMode,
          ctx.actionClass,
          { denied },
        );
        if (decision.allowed) {
          return { action: "continue" };
        }
        if (decision.requiresApproval) {
          const reason = decision.reason ?? "Action requires approval.";
          this.state = {
            ...this.state,
            phase: "waiting_on_user",
            approvalRequest: this.createApprovalRequest(
              reason,
              ctx.actionClass,
              this.hostAdapter.extractScopes(
                ctx.toolName,
                ctx.input as Record<string, unknown>,
              ),
            ),
            waitingState: this.createWaitingState(
              "approval",
              reason,
              "Approve the pending action to continue.",
              ctx.actionClass,
              this.hostAdapter.extractScopes(
                ctx.toolName,
                ctx.input as Record<string, unknown>,
              ),
            ),
            handoff: this.state.activeTask
              ? this.createHandoff(
                  this.state.activeTask.id,
                  "waiting_on_user",
                  "Approve the pending action to continue.",
                )
              : null,
          };
          this.emitState();
        }
        return {
          action: "abort",
          reason: decision.reason ?? "Action blocked by permission policy.",
        };
      },
    });

    this.hookRegistry.register({
      id: "core.read-before-write",
      stage: "before_tool",
      order: 10,
      hostApps: ["word", "excel"],
      run: (ctx) => {
        if (
          ![
            "benign_write",
            "structural_write",
            "destructive_write",
            "unsafe_eval",
          ].includes(ctx.actionClass)
        ) {
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

  private handleSuccessfulMutation(toolName: string, warnings: string[]): void {
    const stepId = this.state.plan?.activeStepId;
    if (!stepId) {
      this.state = { ...this.state, phase: "execute" };
      this.emitState();
      return;
    }

    const decision = this.reflectionEngine.stepReflect({
      stepId,
      toolName,
      isError: false,
      warnings,
      retryDecision: "retry",
    });
    this.state = {
      ...this.state,
      phase: decision.status === "suggest" ? "verify" : "execute",
      handoff:
        decision.status === "suggest" && this.state.activeTask
          ? this.createHandoff(
              this.state.activeTask.id,
              "verify",
              decision.summary,
            )
          : this.state.handoff,
    };
    this.emitState();
  }

  private handleFailedMutation(toolName: string): void {
    const stepId = this.state.plan?.activeStepId ?? "ad-hoc";
    const retryDecision = this.updateRetryLedger(
      stepId,
      `${toolName}:tool-error`,
      toolName,
    );
    const decision = this.reflectionEngine.stepReflect({
      stepId,
      toolName,
      isError: true,
      warnings: [],
      retryDecision,
    });
    if (decision.status === "escalate") {
      this.state = {
        ...this.state,
        phase: "waiting_on_user",
        waitingState: this.createWaitingState(
          "retry_exhausted",
          decision.summary,
          decision.summary,
        ),
        handoff: this.state.activeTask
          ? this.createHandoff(
              this.state.activeTask.id,
              "waiting_on_user",
              decision.summary,
            )
          : null,
      };
      this.emitState();
      return;
    }
    this.state = { ...this.state, phase: "verify" };
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
        const actionClass = this.hostAdapter.classifyAction(tool.name);
        const deniedScopes = this.hostAdapter
          .extractScopes(tool.name, params as Record<string, unknown>)
          .filter((scope) => this.hostAdapter.isDeniedScope(scope));
        const beforeCtx: ToolInvocationContext<Record<string, unknown>> = {
          sessionId: this.options.sessionId,
          hostApp: this.options.hostApp,
          toolName: tool.name,
          actionClass,
          input: params as Record<string, unknown>,
          readScopes: [...this.readScopes],
          deniedScopes,
          phase: this.state.phase,
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

        const parsed =
          result.content[0]?.type === "text"
            ? safeParseJson(result.content[0].text)
            : null;

        if (actionClass === "read") {
          this.recordRead(tool.name, before.input as Record<string, unknown>);
        }

        const warnings =
          parsed?.warnings && Array.isArray(parsed.warnings)
            ? parsed.warnings.map(String)
            : [];

        if (
          [
            "benign_write",
            "structural_write",
            "destructive_write",
            "unsafe_eval",
          ].includes(actionClass)
        ) {
          if (parsed?.success === false || parsed?.error) {
            this.handleFailedMutation(tool.name);
          } else {
            this.handleSuccessfulMutation(tool.name, warnings);
          }
        }

        const after = await this.hookRegistry.runAfterTool({
          ...beforeCtx,
          input: before.input,
          output: result,
          readScopes: [...this.readScopes],
          phase: this.state.phase,
        });
        this.appendTrace(after.trace);
        return result;
      },
    };
  }
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
