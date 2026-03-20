import type { ActionClass, PermissionMode } from "../orchestration/types";

interface PermissionContext {
  denied: boolean;
}

interface PermissionDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

const RISKY_ACTIONS: ActionClass[] = [
  "structural_write",
  "destructive_write",
  "unsafe_eval",
  "external_io",
];

const WRITE_ACTIONS: ActionClass[] = [
  "benign_write",
  "structural_write",
  "destructive_write",
  "unsafe_eval",
];

export function shouldPauseForAction(
  permissionMode: PermissionMode,
  actionClass: ActionClass,
  context: PermissionContext,
): PermissionDecision {
  if (context.denied) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: "Target scope is denied by policy.",
    };
  }

  if (
    actionClass === "read" ||
    actionClass === "plan" ||
    actionClass === "neutral"
  ) {
    return { allowed: true, requiresApproval: false };
  }

  if (permissionMode === "read_only") {
    return {
      allowed: false,
      requiresApproval: false,
      reason: "Permission mode is read-only.",
    };
  }

  if (
    permissionMode === "confirm_writes" &&
    WRITE_ACTIONS.includes(actionClass)
  ) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: "Permission mode requires approval before writes.",
    };
  }

  if (
    permissionMode === "confirm_risky" &&
    RISKY_ACTIONS.includes(actionClass)
  ) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: "Permission mode requires approval for risky actions.",
    };
  }

  return { allowed: true, requiresApproval: false };
}
