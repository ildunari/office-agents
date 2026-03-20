export type PlanMode = "auto" | "manual" | "revised";

export type PlanStatus = "active" | "completed" | "failed" | "abandoned";

export type StepStatus =
  | "pending"
  | "active"
  | "completed"
  | "failed"
  | "skipped";

export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex";

export type RiskLevel = "none" | "low" | "medium" | "high";

export interface TaskClassification {
  complexity: TaskComplexity;
  risk: RiskLevel;
  needsPlan: boolean;
  suggestedSteps?: number;
  rationale: string;
}

export type StepKind = "read" | "analyze" | "write" | "verify" | "rollback";

export interface PlanStep {
  id: string;
  description: string;
  kind: StepKind;
  status: StepStatus;
  successCriteria: string;
  retryLimit: number;
  retryCount: number;
  scope?: Record<string, unknown>;
  patternIds?: string[];
  toolCalls: string[];
  after?: string[];
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface PlanRevisionNote {
  at: number;
  reason: string;
}

export interface ExecutionPlan {
  id: string;
  userRequest: string;
  mode: PlanMode;
  status: PlanStatus;
  steps: PlanStep[];
  createdAt: number;
  updatedAt: number;
  classification: TaskClassification;
  revisionNotes: PlanRevisionNote[];
}

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

export interface TaskRecord {
  id: string;
  userRequest: string;
  status: TaskStatus;
  planId?: string;
  undoNarrative?: string;
  toolCallIds: string[];
  createdAt: number;
  updatedAt: number;
}
