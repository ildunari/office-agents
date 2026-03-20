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
}

export function stepLabel(step: PlanChecklistStep): string {
  return step.title || step.description || step.id;
}

export function statusLabel(status?: string | null): string {
  if (!status) return "planned";
  return status.replace(/_/g, " ");
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
