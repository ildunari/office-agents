import { describe, expect, it } from "vitest";
import { RetryLedger } from "../src/reflection/RetryLedger";

describe("RetryLedger", () => {
  it("retries while the step stays under the cap with a new approach hash", () => {
    const ledger = new RetryLedger();
    expect(ledger.record("step-1", "format-drift", "approach-a")).toBe("retry");
    expect(ledger.record("step-1", "format-drift", "approach-b")).toBe("retry");
  });

  it("escalates after repeated issue signatures or retry exhaustion", () => {
    const ledger = new RetryLedger();
    ledger.record("step-2", "numeric-drift", "approach-a");
    expect(ledger.record("step-2", "numeric-drift", "approach-a")).toBe(
      "escalate",
    );

    const ledger2 = new RetryLedger();
    ledger2.record("step-3", "error", "a");
    ledger2.record("step-3", "error", "b");
    expect(ledger2.record("step-3", "error", "c")).toBe("escalate");
  });
});
