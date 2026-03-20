export interface PlanChecklistStep {
  id: string;
  title?: string;
  description?: string;
  status?: "pending" | "active" | "completed" | "failed" | "skipped";
}

export interface PlanChecklistPlan {
  summary?: string;
  userRequest?: string;
  status?: string;
  activeStepId?: string | null;
  steps?: PlanChecklistStep[];
}

export interface PlanChecklistTask {
  status?: string | null;
  handoff?: {
    nextRecommendedAction?: string;
    incompleteVerifications?: string[];
    summary?: string;
  } | null;
}

export interface PlanChecklistApproval {
  reason?: string | null;
  destructive?: boolean | null;
}

export interface PlanChecklistVerification {
  status?: string | null;
  results?: Array<{ suiteId: string; status: string }>;
}

export interface PlanChecklistPattern {
  id: string;
  reason: string;
}

export interface PlanChecklistContextBudget {
  action: string;
  usagePct: number;
}

export function stepLabel(step: PlanChecklistStep): string {
  return step.title || step.description || step.id;
}

export function statusLabel(status?: string | null): string {
  if (!status) return "planned";
  return status.replace(/_/g, " ");
}

export function modeLabel(mode?: string | null): string {
  if (!mode) return "discuss";
  return mode.replace(/_/g, " ");
}

export function verificationLabel(
  verification?: PlanChecklistVerification | null,
): string {
  if (!verification?.status) return "not run";
  return statusLabel(verification.status);
}

export function incompleteVerificationCount(
  task?: PlanChecklistTask | null,
): number {
  return task?.handoff?.incompleteVerifications?.length ?? 0;
}

export function shouldShowApprove(
  mode?: string | null,
  approval?: PlanChecklistApproval | null,
): boolean {
  return mode === "awaiting_approval" && Boolean(approval);
}

export function shouldShowResume(
  mode?: string | null,
  task?: PlanChecklistTask | null,
): boolean {
  return mode === "blocked" && Boolean(task?.handoff);
}

export function contextBudgetLabel(
  budget?: PlanChecklistContextBudget | null,
): string {
  if (!budget) return "not tracked";
  return `${budget.action} @ ${budget.usagePct}%`;
}

export function getPlanProgress(plan: PlanChecklistPlan | null): {
  total: number;
  completed: number;
  inFlight: number;
  percent: number;
} {
  const steps = plan?.steps ?? [];
  const completed = steps.filter((step) => step.status === "completed").length;
  const inFlight = steps.some((step) => step.status === "active") ? 1 : 0;
  const total = steps.length;
  const current = completed + inFlight;

  return {
    total,
    completed: current,
    inFlight,
    percent: total > 0 ? (current / total) * 100 : 0,
  };
}
