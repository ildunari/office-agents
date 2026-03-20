import type { OfficeApp } from "../context/types";
import type { ExecutionPlan, TaskClassification } from "../planning";

export interface Disposable {
  dispose(): void;
}

export interface ReasoningPattern<TState = unknown> {
  id: string;
  name: string;
  apps: OfficeApp[];
  triggers: (
    classification: TaskClassification,
    plan?: ExecutionPlan,
  ) => boolean;
  activate: (registry: unknown, state: TState) => Disposable;
  defaultState: () => TState;
}
