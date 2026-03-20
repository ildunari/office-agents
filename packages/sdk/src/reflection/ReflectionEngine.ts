import type { RetryDecision } from "./RetryLedger";

export interface MicroReflectionInput {
  toolName: string;
  isError: boolean;
  warnings: string[];
}

export interface StepReflectionInput extends MicroReflectionInput {
  stepId: string;
  retryDecision: RetryDecision;
}

export interface ReflectionDecision {
  status: "pass" | "retry" | "suggest" | "escalate";
  summary: string;
}

export class ReflectionEngine {
  microReflect(input: MicroReflectionInput): ReflectionDecision {
    if (input.isError) {
      return {
        status: "retry",
        summary: `${input.toolName} failed and should retry with a safer or narrower approach.`,
      };
    }
    if (input.warnings.length > 0) {
      return {
        status: "suggest",
        summary: `${input.toolName} completed with warnings that should be surfaced or validated.`,
      };
    }
    return {
      status: "pass",
      summary: `${input.toolName} completed without immediate reflection issues.`,
    };
  }

  stepReflect(input: StepReflectionInput): ReflectionDecision {
    if (input.isError && input.retryDecision === "escalate") {
      return {
        status: "escalate",
        summary: `${input.stepId} exhausted safe retries and should wait on user input.`,
      };
    }
    return this.microReflect(input);
  }
}
