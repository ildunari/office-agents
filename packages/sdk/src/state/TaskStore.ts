import type {
  HandoffState,
  LearnedMemory,
  OrchestratorState,
  WaitingState,
  WorkspaceGuidance,
} from "../orchestration/types";
import { fileExists, readFile, writeFile } from "../vfs";

const STATE_PATH = "/home/user/.oa/orchestrator-state.json";
const WAITING_PATH = "/home/user/.oa/waiting-state.json";
const HANDOFF_PATH = "/home/user/.oa/handoff.json";
const GUIDANCE_PATH = "/home/user/.oa/workspace-guidance.json";
const MEMORY_PATH = "/home/user/.oa/learned-memory.json";

interface PersistedArtifacts {
  waitingState: WaitingState | null;
  handoff: HandoffState | null;
  workspaceGuidance: WorkspaceGuidance | null;
  learnedMemory: LearnedMemory | null;
}

export class TaskStore {
  async save(state: OrchestratorState): Promise<void> {
    await Promise.all([
      writeFile(STATE_PATH, JSON.stringify(state, null, 2)),
      writeFile(WAITING_PATH, JSON.stringify(state.waitingState, null, 2)),
      writeFile(HANDOFF_PATH, JSON.stringify(state.handoff, null, 2)),
      writeFile(
        GUIDANCE_PATH,
        JSON.stringify(state.workspaceGuidance, null, 2),
      ),
      writeFile(MEMORY_PATH, JSON.stringify(state.learnedMemory, null, 2)),
    ]);
  }

  async load(): Promise<OrchestratorState | null> {
    if (!(await fileExists(STATE_PATH))) {
      return null;
    }
    const raw = await readFile(STATE_PATH);
    return JSON.parse(raw) as OrchestratorState;
  }

  async loadArtifacts(): Promise<PersistedArtifacts> {
    return {
      waitingState: await this.loadArtifact<WaitingState>(WAITING_PATH),
      handoff: await this.loadArtifact<HandoffState>(HANDOFF_PATH),
      workspaceGuidance:
        await this.loadArtifact<WorkspaceGuidance>(GUIDANCE_PATH),
      learnedMemory: await this.loadArtifact<LearnedMemory>(MEMORY_PATH),
    };
  }

  private async loadArtifact<T>(path: string): Promise<T | null> {
    if (!(await fileExists(path))) {
      return null;
    }
    return JSON.parse(await readFile(path)) as T;
  }
}
