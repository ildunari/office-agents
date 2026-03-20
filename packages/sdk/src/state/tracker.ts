import type { TaskClassification, TaskRecord } from "../planning";
import { saveTaskRecord, type TaskRecordEntry } from "../storage/db";
import { buildUndoNarrative, type TrackedMutation } from "./undo";

export interface BeginTaskOptions {
  planId?: string;
}

export class TaskTracker {
  private currentTask: TaskRecord | null = null;
  private mutations: TrackedMutation[] = [];

  beginTask(
    userRequest: string,
    classification: TaskClassification,
    options: BeginTaskOptions = {},
  ): TaskRecord {
    const now = Date.now();
    this.currentTask = {
      id: crypto.randomUUID(),
      userRequest,
      status: classification.needsPlan ? "in_progress" : "pending",
      planId: options.planId,
      toolCallIds: [],
      createdAt: now,
      updatedAt: now,
    };
    this.mutations = [];
    return this.currentTask;
  }

  getCurrentTask(): TaskRecord | null {
    return this.currentTask;
  }

  hydrate(record: TaskRecordEntry | null | undefined): TaskRecord | null {
    this.currentTask = record ? { ...record.task } : null;
    this.mutations = [];
    return this.currentTask;
  }

  reset(): void {
    this.currentTask = null;
    this.mutations = [];
  }

  recordToolCall(toolCallId: string): void {
    if (!this.currentTask) return;
    this.currentTask = {
      ...this.currentTask,
      status: "in_progress",
      toolCallIds: [...this.currentTask.toolCallIds, toolCallId],
      updatedAt: Date.now(),
    };
  }

  recordMutation(mutation: TrackedMutation): void {
    this.mutations.push(mutation);
  }

  buildUndoNarrative(): string {
    return buildUndoNarrative(this.mutations);
  }

  completeTask(summary?: string): TaskRecord | null {
    if (!this.currentTask) return null;
    this.currentTask = {
      ...this.currentTask,
      status: "completed",
      undoNarrative: summary
        ? `${buildUndoNarrative(this.mutations)}\nSummary: ${summary}`
        : buildUndoNarrative(this.mutations),
      updatedAt: Date.now(),
    };
    return this.currentTask;
  }

  failTask(error: string): TaskRecord | null {
    if (!this.currentTask) return null;
    this.currentTask = {
      ...this.currentTask,
      status: "failed",
      undoNarrative: buildUndoNarrative(this.mutations),
      updatedAt: Date.now(),
    };
    this.recordMutation({
      toolName: "task_failure",
      scope: "task",
      summary: error,
    });
    return this.currentTask;
  }

  async persist(sessionId: string): Promise<TaskRecordEntry | null> {
    if (!this.currentTask) return null;
    await saveTaskRecord(sessionId, this.currentTask);
    return {
      id: this.currentTask.id,
      sessionId,
      task: { ...this.currentTask },
      createdAt: this.currentTask.createdAt,
      updatedAt: this.currentTask.updatedAt,
    };
  }
}
