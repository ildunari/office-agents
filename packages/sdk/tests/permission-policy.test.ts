import { describe, expect, it } from "vitest";
import { shouldPauseForAction } from "../src/hooks/permission-policy";

describe("shouldPauseForAction", () => {
  it("blocks writes in read_only mode", () => {
    expect(
      shouldPauseForAction("read_only", "benign_write", { denied: false }),
    ).toEqual({
      allowed: false,
      requiresApproval: false,
      reason: "Permission mode is read-only.",
    });
  });

  it("requires approval for any write in confirm_writes mode", () => {
    expect(
      shouldPauseForAction("confirm_writes", "benign_write", { denied: false }),
    ).toEqual({
      allowed: false,
      requiresApproval: true,
      reason: "Permission mode requires approval before writes.",
    });
  });

  it("allows benign writes but pauses risky actions in confirm_risky mode", () => {
    expect(
      shouldPauseForAction("confirm_risky", "benign_write", {
        denied: false,
      }),
    ).toEqual({
      allowed: true,
      requiresApproval: false,
    });
    expect(
      shouldPauseForAction("confirm_risky", "unsafe_eval", {
        denied: false,
      }),
    ).toEqual({
      allowed: false,
      requiresApproval: true,
      reason: "Permission mode requires approval for risky actions.",
    });
  });

  it("denies actions targeting blocked scopes even in full_auto mode", () => {
    expect(
      shouldPauseForAction("full_auto", "benign_write", { denied: true }),
    ).toEqual({
      allowed: false,
      requiresApproval: false,
      reason: "Target scope is denied by policy.",
    });
  });
});
