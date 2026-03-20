import { describe, expect, it } from "vitest";
import { classifyTask } from "../src/planning/classifier";

describe("classifyTask", () => {
  it("keeps simple read-only Word requests implicit", () => {
    const classification = classifyTask({
      hostApp: "word",
      prompt: "Summarize the selected paragraph in two bullets.",
    });

    expect(classification.mutatesDocument).toBe(false);
    expect(classification.risk).toBe("low");
    expect(classification.requiresVisiblePlan).toBe(false);
    expect(classification.planMode).toBe("implicit");
  });

  it("requires approval for broad Word rewrites", () => {
    const classification = classifyTask({
      hostApp: "word",
      prompt:
        "Rewrite the whole contract to be shorter, clean up formatting, and replace repeated wording throughout the document.",
    });

    expect(classification.mutatesDocument).toBe(true);
    expect(classification.risk).toBe("high");
    expect(classification.requiresApprovalBeforeMutation).toBe(true);
    expect(classification.planMode).toBe("approval_required");
    expect(classification.likelyPatternIds).toContain("word.format_fingerprinting");
  });

  it("surfaces Excel modeling tasks as visible plans", () => {
    const classification = classifyTask({
      hostApp: "excel",
      prompt:
        "Build a forecast model from these sheets and show the assumptions, formulas, and output area.",
    });

    expect(classification.mutatesDocument).toBe(true);
    expect(classification.requiresVisiblePlan).toBe(true);
    expect(classification.planMode).toBe("guided");
    expect(classification.likelyPatternIds).toContain(
      "excel.dependency_graph_materialization",
    );
    expect(classification.likelyPatternIds).toContain(
      "excel.schema_inference",
    );
  });
});
