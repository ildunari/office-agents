import type {
  HostApp,
  HostScopeRef,
  TaskClassification,
} from "../orchestration/types";

interface ClassifyTaskInput {
  hostApp: HostApp;
  prompt: string;
}

const MUTATION_VERBS = [
  "edit",
  "rewrite",
  "update",
  "change",
  "replace",
  "insert",
  "delete",
  "remove",
  "build",
  "format",
  "clean",
  "fix",
  "modify",
];

const HIGH_RISK_HINTS = [
  "whole",
  "entire",
  "throughout",
  "all sheets",
  "entire workbook",
  "entire document",
  "delete",
  "remove",
  "replace all",
  "restructure",
];

const DISCUSS_HINTS = [
  "entire",
  "whole",
  "throughout",
  "reorganize",
  "clean up",
  "make it better",
  "polish",
  "improve",
];

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function detectLikelyPatterns(hostApp: HostApp, prompt: string): string[] {
  if (hostApp === "word") {
    const patternIds = ["word.semantic_load_bearing_analysis"];
    if (includesAny(prompt, ["format", "style", "preserve", "track changes"])) {
      patternIds.push("word.format_fingerprinting");
    }
    if (/\b\d/.test(prompt)) {
      patternIds.push("word.numeric_sanctity_guard");
    }
    return patternIds;
  }
  if (hostApp === "excel") {
    const patternIds = ["excel.schema_inference"];
    if (includesAny(prompt, ["formula", "model", "forecast", "assumptions"])) {
      patternIds.push("excel.dependency_graph_materialization");
      patternIds.push("excel.unit_consistency_check");
    }
    if (includesAny(prompt, ["rename", "move", "resize", "table", "sheet"])) {
      patternIds.push("excel.ripple_impact_estimation");
    }
    return patternIds;
  }
  return [];
}

function defaultTargetScopes(hostApp: HostApp): HostScopeRef[] {
  return [
    {
      kind: hostApp === "excel" ? "excel.workbook" : "word.document",
      ref: hostApp === "excel" ? "workbook" : "document",
    },
  ];
}

export function classifyTask(input: ClassifyTaskInput): TaskClassification {
  const prompt = input.prompt.trim().toLowerCase();
  const mutatesDocument = includesAny(prompt, MUTATION_VERBS);
  const highRisk =
    mutatesDocument &&
    (includesAny(prompt, HIGH_RISK_HINTS) ||
      (input.hostApp === "word" &&
        includesAny(prompt, ["contract", "legal", "policy"])));
  const moderate =
    mutatesDocument ||
    prompt.length > 120 ||
    includesAny(prompt, ["compare", "analyze", "summarize", "forecast"]);
  const requiresDiscussion =
    highRisk || includesAny(prompt, DISCUSS_HINTS) || prompt.length > 160;
  const complexity = highRisk ? "complex" : moderate ? "moderate" : "simple";
  const risk = highRisk ? "high" : mutatesDocument ? "medium" : "low";
  const requiresApprovalBeforeMutation = highRisk;
  const planMode = !mutatesDocument
    ? "implicit"
    : requiresApprovalBeforeMutation
      ? "approval_required"
      : "guided";

  return {
    complexity,
    mutatesDocument,
    risk,
    requiresVisiblePlan: planMode !== "implicit",
    requiresApprovalBeforeMutation,
    requiresDiscussion,
    planMode,
    likelyPatternIds: detectLikelyPatterns(input.hostApp, prompt),
    targetScopes: defaultTargetScopes(input.hostApp),
    rationale: [
      mutatesDocument ? "Detected edit/build verbs." : "Read-only language.",
      requiresDiscussion
        ? "Broad or ambiguous wording benefits from a discuss phase."
        : "Prompt is specific enough to plan directly.",
      highRisk
        ? "Broad or destructive wording raises approval requirements."
        : "No broad destructive intent detected.",
    ],
  };
}
