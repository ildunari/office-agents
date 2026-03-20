import type { RetryLedgerEntry } from "../orchestration/types";

export type RetryDecision = "retry" | "escalate";

export class RetryLedger {
  private readonly entries = new Map<string, RetryLedgerEntry>();

  hydrate(entries: RetryLedgerEntry[]): void {
    this.entries.clear();
    for (const entry of entries) {
      this.entries.set(entry.stepId, { ...entry });
    }
  }

  snapshot(): RetryLedgerEntry[] {
    return [...this.entries.values()];
  }

  record(
    stepId: string,
    issueSignature: string,
    approachHash: string,
  ): RetryDecision {
    const existing = this.entries.get(stepId);
    if (!existing) {
      this.entries.set(stepId, {
        stepId,
        attempts: 1,
        lastIssueSignature: issueSignature,
        lastApproachHash: approachHash,
      });
      return "retry";
    }

    const attempts = existing.attempts + 1;
    const sameIssue = existing.lastIssueSignature === issueSignature;
    const sameApproach = existing.lastApproachHash === approachHash;
    const next = {
      stepId,
      attempts,
      lastIssueSignature: issueSignature,
      lastApproachHash: approachHash,
    };
    this.entries.set(stepId, next);

    if ((sameIssue && sameApproach) || attempts > 2) {
      return "escalate";
    }
    return "retry";
  }
}
