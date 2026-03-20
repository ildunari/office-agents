import type { ExecutionPlan } from "../orchestration/types";

export interface PlanReviewResult {
  status: "pass" | "fail";
  issues: string[];
}

export class PlanReviewer {
  review(plan: ExecutionPlan): PlanReviewResult {
    const issues: string[] = [];
    const stepKinds = new Set(plan.steps.map((step) => step.kind));

    if (plan.risk.requiresValidation) {
      for (const required of [
        "discover",
        "transform",
        "validate",
        "communicate",
      ] as const) {
        if (!stepKinds.has(required)) {
          issues.push(`Mutating plans must include a ${required} step.`);
        }
      }
    }

    return {
      status: issues.length === 0 ? "pass" : "fail",
      issues,
    };
  }
}
