import { Type } from "@sinclair/typebox";
import type { ExecutionPlan, UpdatePlanInput } from "../orchestration/types";
import { defineTool, toolSuccess } from "../tools/types";

export function createUpdatePlanTool(
  onUpdate: (input: UpdatePlanInput) => ExecutionPlan | null,
) {
  return defineTool({
    name: "update_plan",
    label: "Update Plan",
    description:
      "Internal planning tool. Use it to create or update the visible execution checklist before and during multi-step work.",
    parameters: Type.Object({
      summary: Type.Optional(Type.String()),
      steps: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.String(),
            title: Type.String(),
            objective: Type.String(),
            status: Type.Union([
              Type.Literal("pending"),
              Type.Literal("in_progress"),
              Type.Literal("completed"),
              Type.Literal("failed"),
              Type.Literal("blocked"),
              Type.Literal("skipped"),
            ]),
          }),
        ),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const plan = onUpdate(params);
      return toolSuccess({
        success: true,
        plan,
      });
    },
  });
}
