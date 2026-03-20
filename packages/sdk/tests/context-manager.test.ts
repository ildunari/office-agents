import { describe, expect, it } from "vitest";
import { ContextManager } from "../src/context/ContextManager";

describe("ContextManager", () => {
  it("reports low pressure when usage is comfortably below the window", () => {
    const manager = new ContextManager();
    const budget = manager.compute({
      inputTokens: 1000,
      outputTokens: 500,
      cacheRead: 0,
      cacheWrite: 0,
      totalCost: 0,
      contextWindow: 10000,
      lastInputTokens: 1500,
    });

    expect(budget?.pressure).toBe("low");
  });

  it("reports critical pressure near the context limit", () => {
    const manager = new ContextManager();
    const budget = manager.compute({
      inputTokens: 8000,
      outputTokens: 500,
      cacheRead: 0,
      cacheWrite: 0,
      totalCost: 0,
      contextWindow: 10000,
      lastInputTokens: 9200,
    });

    expect(budget?.pressure).toBe("critical");
  });
});
