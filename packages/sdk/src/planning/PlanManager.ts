import { generateId } from "../message-utils";
import type {
  ExecutionPlan,
  HostApp,
  PlanStep,
  TaskClassification,
  UpdatePlanInput,
} from "../orchestration/types";

interface CreatePlanInput {
  taskId: string;
  hostApp: HostApp;
  prompt: string;
  classification: TaskClassification;
}

function successCriterion(id: string, description: string) {
  return { id, description, required: true };
}

function createStep(
  title: string,
  objective: string,
  kind: PlanStep["kind"],
  mutatesDocument: boolean,
  toolHints: string[] = [],
): PlanStep {
  return {
    id: generateId(),
    title,
    objective,
    status: "pending",
    kind,
    mutatesDocument,
    dependsOn: [],
    toolHints,
    successCriteria: [
      successCriterion(`${kind}-done`, `${title} completed successfully.`),
    ],
  };
}

function ensureActiveStep(plan: ExecutionPlan): ExecutionPlan {
  const inProgress = plan.steps.find((step) => step.status === "in_progress");
  if (inProgress) {
    return { ...plan, activeStepId: inProgress.id };
  }
  const firstPending = plan.steps.find((step) => step.status === "pending");
  return {
    ...plan,
    activeStepId: firstPending?.id,
  };
}

export class PlanManager {
  createPlan(input: CreatePlanInput): ExecutionPlan {
    const steps: PlanStep[] = [];
    steps.push(
      createStep(
        "Inspect the target scope",
        input.classification.mutatesDocument
          ? "Read the relevant host scope before changing it."
          : "Gather the minimum context needed to answer safely.",
        "discover",
        false,
      ),
    );

    if (input.classification.mutatesDocument) {
      steps.push(
        createStep(
          "Make the requested change",
          `Apply the requested ${input.hostApp} mutation without breaking adjacent structure.`,
          "transform",
          true,
        ),
        createStep(
          "Validate the result",
          "Check the mutated scope, ensure required facts and structure were preserved, and capture any warnings.",
          "validate",
          false,
        ),
      );
    }

    steps.push(
      createStep(
        "Summarize the outcome",
        "Explain what changed, what was validated, and any remaining risks.",
        "communicate",
        false,
      ),
    );

    if (steps.length > 0) {
      steps[0].status = "in_progress";
    }

    return {
      id: generateId(),
      taskId: input.taskId,
      hostApp: input.hostApp,
      version: 1,
      mode: input.classification.planMode,
      status: "active",
      summary: input.prompt,
      steps,
      activeStepId: steps[0]?.id,
      selectedPatternIds: input.classification.likelyPatternIds,
      risk: {
        level: input.classification.risk,
        destructive: input.classification.requiresApprovalBeforeMutation,
        requiresValidation: input.classification.mutatesDocument,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  applyUpdate(plan: ExecutionPlan, update: UpdatePlanInput): ExecutionPlan {
    const stepUpdates = new Map(
      (update.steps ?? []).map((step) => [step.id, step]),
    );
    const nextSteps = plan.steps.map((step) => {
      const incoming = stepUpdates.get(step.id);
      if (!incoming) return step;
      return {
        ...step,
        title: incoming.title,
        objective: incoming.objective,
        status: incoming.status,
      };
    });

    const normalizedSteps = nextSteps.map((step, index) => {
      if (step.status === "in_progress") {
        const earlierActive = nextSteps.findIndex(
          (candidate) => candidate.status === "in_progress",
        );
        if (earlierActive !== index) {
          return { ...step, status: "pending" as const };
        }
      }
      return step;
    });

    return ensureActiveStep({
      ...plan,
      version: plan.version + 1,
      summary: update.summary ?? plan.summary,
      steps: normalizedSteps,
      updatedAt: new Date().toISOString(),
    });
  }
}
