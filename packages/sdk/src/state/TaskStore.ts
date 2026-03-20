import type { OrchestratorState } from "../orchestration/types";
import { fileExists, readFile, writeFile } from "../vfs";

const STATE_PATH = "/home/user/.oa/orchestrator-state.json";

export class TaskStore {
  async save(state: OrchestratorState): Promise<void> {
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
  }

  async load(): Promise<OrchestratorState | null> {
    if (!(await fileExists(STATE_PATH))) {
      return null;
    }
    const raw = await readFile(STATE_PATH);
    return JSON.parse(raw) as OrchestratorState;
  }
}
