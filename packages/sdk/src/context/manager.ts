import type { ContextBudget, DocumentMap, OfficeApp } from "./types";

export type ContextAction =
  | "none"
  | "summarize"
  | "compact"
  | "prune"
  | "emergency";

const DEFAULT_BUDGET: ContextBudget = {
  summarizeThreshold: 60,
  compactThreshold: 75,
  pruneThreshold: 85,
  emergencyThreshold: 92,
};

export class ContextManager {
  constructor(private readonly budget: ContextBudget = DEFAULT_BUDGET) {}

  getActionForUsage(usagePct: number): ContextAction {
    if (usagePct >= this.budget.emergencyThreshold) return "emergency";
    if (usagePct >= this.budget.pruneThreshold) return "prune";
    if (usagePct >= this.budget.compactThreshold) return "compact";
    if (usagePct >= this.budget.summarizeThreshold) return "summarize";
    return "none";
  }

  getWorkingMemoryPaths(planId: string) {
    return {
      plan: `/.oa/plans/${planId}.json`,
      taskState: "/.oa/state/task.json",
      reflections: "/.oa/state/reflections.json",
      documentMap: "/.oa/context/document-map.json",
      workingSet: "/.oa/context/working-set.json",
    };
  }

  createDocumentMap(app: OfficeApp): DocumentMap {
    return { app, regions: new Map() };
  }

  updateRegionHash(
    documentMap: DocumentMap,
    regionKey: string,
    hash: string,
    updatedAt = Date.now(),
  ): DocumentMap {
    documentMap.regions.set(regionKey, { hash, updatedAt });
    return documentMap;
  }
}
