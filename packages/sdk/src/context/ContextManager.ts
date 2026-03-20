import type { SessionStats } from "../message-utils";
import type { ContextBudgetState } from "../orchestration/types";

export class ContextManager {
  compute(stats: SessionStats): ContextBudgetState | null {
    if (stats.contextWindow <= 0) return null;

    const usedPromptTokens = Math.max(
      stats.lastInputTokens,
      stats.inputTokens + stats.cacheRead + stats.cacheWrite,
    );
    const reservedOutputTokens = 4000;
    const ratio = usedPromptTokens / stats.contextWindow;
    const pressure =
      ratio >= 0.85
        ? "critical"
        : ratio >= 0.75
          ? "high"
          : ratio >= 0.6
            ? "medium"
            : "low";

    return {
      usedPromptTokens,
      modelLimitTokens: stats.contextWindow,
      reservedOutputTokens,
      pressure,
    };
  }
}
