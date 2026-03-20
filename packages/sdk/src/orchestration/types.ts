export type HostApp = "word" | "excel" | "generic";

export type TaskComplexity = "simple" | "moderate" | "complex";
export type TaskRisk = "low" | "medium" | "high";
export type PlanMode = "implicit" | "guided" | "approval_required";
export type TaskStatus =
  | "drafting_plan"
  | "awaiting_approval"
  | "executing"
  | "paused"
  | "blocked"
  | "completed"
  | "cancelled";
export type PlanStatus =
  | "draft"
  | "active"
  | "paused"
  | "blocked"
  | "completed"
  | "cancelled";
export type StepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "blocked"
  | "skipped";
export type StepKind = "discover" | "transform" | "validate" | "communicate";

export interface HostScopeRef {
  kind: string;
  ref: string;
}

export interface TaskClassification {
  complexity: TaskComplexity;
  mutatesDocument: boolean;
  risk: TaskRisk;
  requiresVisiblePlan: boolean;
  requiresApprovalBeforeMutation: boolean;
  planMode: PlanMode;
  likelyPatternIds: string[];
  targetScopes: HostScopeRef[];
  rationale: string[];
}

export interface ValidationCriterion {
  id: string;
  description: string;
  required: boolean;
}

export interface PlanStep {
  id: string;
  title: string;
  objective: string;
  status: StepStatus;
  kind: StepKind;
  mutatesDocument: boolean;
  dependsOn: string[];
  toolHints?: string[];
  successCriteria: ValidationCriterion[];
}

export interface ExecutionPlan {
  id: string;
  taskId: string;
  hostApp: HostApp;
  version: number;
  mode: PlanMode;
  status: PlanStatus;
  summary: string;
  steps: PlanStep[];
  activeStepId?: string;
  selectedPatternIds: string[];
  risk: {
    level: TaskRisk;
    destructive: boolean;
    requiresValidation: boolean;
  };
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  sessionId: string;
  hostApp: HostApp;
  documentKey: string;
  prompt: string;
  status: TaskStatus;
  classification: TaskClassification;
  planId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePlanStepInput {
  id: string;
  title: string;
  objective: string;
  status: StepStatus;
}

export interface UpdatePlanInput {
  summary?: string;
  steps?: UpdatePlanStepInput[];
}

export interface ApprovalRequest {
  reason: string;
  uiMessage: string;
}

export interface UndoEntry {
  id: string;
  summary: string;
  createdAt: string;
}

export interface ContextBudgetState {
  usedPromptTokens: number;
  modelLimitTokens: number;
  reservedOutputTokens: number;
  pressure: "low" | "medium" | "high" | "critical";
}

export interface HookTraceEntry {
  hookId: string;
  stage: string;
  toolName: string;
  outcome: "continued" | "blocked" | "warned";
  message?: string;
  at: string;
}

export interface OrchestratorState {
  activeTask: TaskRecord | null;
  plan: ExecutionPlan | null;
  approvalRequest: ApprovalRequest | null;
  undoLog: UndoEntry[];
  contextBudget: ContextBudgetState | null;
  hookTrace: HookTraceEntry[];
}
