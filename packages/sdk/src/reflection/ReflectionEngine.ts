export interface MicroReflectionInput {
  toolName: string;
  isError: boolean;
  warnings: string[];
}

export interface ReflectionDecision {
  status: "pass" | "retry" | "suggest";
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
}
