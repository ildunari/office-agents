import { describe, expect, it } from "vitest";
import { VerificationEngine } from "../src/verification";

describe("VerificationEngine", () => {
  it("returns skipped when no suites apply", async () => {
    const engine = new VerificationEngine();
    const result = await engine.run({
      mode: "verify",
      request: "noop",
      plan: null,
      task: null,
      toolExecutions: [],
      promptNotes: [],
    });

    expect(result).toEqual({
      status: "skipped",
      retryable: false,
      results: [],
    });
  });

  it("summarizes retryable and failed verification states", async () => {
    const engine = new VerificationEngine([
      {
        id: "suite-a",
        label: "Suite A",
        appliesTo: () => true,
        verify: () => ({
          suiteId: "suite-a",
          label: "Suite A",
          expectedEffect: "expected",
          observedEffect: "retry me",
          status: "retryable",
          evidence: [],
          retryable: true,
        }),
      },
      {
        id: "suite-b",
        label: "Suite B",
        appliesTo: () => true,
        verify: () => ({
          suiteId: "suite-b",
          label: "Suite B",
          expectedEffect: "expected",
          observedEffect: "failed",
          status: "failed",
          evidence: [],
          retryable: false,
        }),
      },
    ]);

    const result = await engine.run({
      mode: "verify",
      request: "verify",
      plan: null,
      task: null,
      toolExecutions: [],
      promptNotes: [],
    });

    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
    expect(result.results).toHaveLength(2);
  });
});
