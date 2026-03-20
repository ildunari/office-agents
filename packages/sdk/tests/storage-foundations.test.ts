import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deletePlanRecords,
  getLatestPlanRecord,
  getPlanRecord,
  listReflectionEntries,
  listTaskRecords,
  savePlanRecord,
  saveReflectionEntry,
  saveTaskRecord,
} from "../src/storage/db";
import { configureNamespace } from "../src/storage/namespace";
import type {
  ExecutionPlan,
  TaskClassification,
  TaskRecord,
} from "../src/planning";
import type { ReflectionResult } from "../src/reflection/types";

let namespaceCounter = 0;
let currentDbName = "";

function nextNamespace() {
  namespaceCounter += 1;
  currentDbName = `OfficeAgentsDB_foundations_${namespaceCounter}`;
  configureNamespace({
    dbName: currentDbName,
    dbVersion: 2,
    localStoragePrefix: `office-agents-foundations-${namespaceCounter}`,
    documentSettingsPrefix: `office-agents-foundations-${namespaceCounter}`,
    documentIdSettingsKey: `office-agents-foundations-${namespaceCounter}-document-id`,
  });
}

async function deleteCurrentDb() {
  if (!currentDbName) return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(currentDbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

const classification: TaskClassification = {
  complexity: "moderate",
  risk: "medium",
  needsPlan: true,
  rationale: "Needs a plan for safe execution.",
};

const plan: ExecutionPlan = {
  id: "plan-1",
  userRequest: "Rewrite and verify.",
  mode: "auto",
  status: "active",
  steps: [],
  createdAt: 1,
  updatedAt: 1,
  classification,
  revisionNotes: [],
};

const task: TaskRecord = {
  id: "task-1",
  userRequest: "Rewrite and verify.",
  status: "in_progress",
  planId: "plan-1",
  toolCallIds: ["tc-1"],
  createdAt: 1,
  updatedAt: 1,
};

const reflection: ReflectionResult = {
  level: "task",
  score: 0.9,
  criteria: { intentMatch: true, scopeAppropriate: true },
  observations: ["Looks good."],
  timestamp: 1,
};

describe("storage foundations", () => {
  beforeEach(() => {
    nextNamespace();
  });

  afterEach(async () => {
    await deleteCurrentDb();
  });

  it("persists plan, task, and reflection records by session", async () => {
    await savePlanRecord("session-1", plan);
    await saveTaskRecord("session-1", task);
    await saveReflectionEntry("session-1", reflection);

    const storedPlan = await getPlanRecord("plan-1");
    const tasks = await listTaskRecords("session-1");
    const reflections = await listReflectionEntries("session-1");

    expect(storedPlan?.plan.id).toBe("plan-1");
    expect(tasks).toHaveLength(1);
    expect(reflections).toHaveLength(1);
  });

  it("deletes plan records for a session without touching others", async () => {
    await savePlanRecord("session-1", plan);
    await savePlanRecord("session-2", { ...plan, id: "plan-2" });

    await deletePlanRecords("session-1");

    expect(await getPlanRecord("plan-1")).toBeUndefined();
    expect(await getPlanRecord("plan-2")).toBeDefined();
  });

  it("returns the newest plan record for a session", async () => {
    await savePlanRecord("session-1", plan);
    await savePlanRecord("session-1", {
      ...plan,
      id: "plan-2",
      updatedAt: plan.updatedAt + 100,
    });

    const latest = await getLatestPlanRecord("session-1");

    expect(latest?.id).toBe("plan-2");
  });
});
