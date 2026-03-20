import {
  Agent,
  type AgentEvent,
  type ThinkingLevel as AgentThinkingLevel,
  type AgentTool,
} from "@mariozechner/pi-agent-core";
import {
  type Api,
  type AssistantMessage,
  getModel,
  getModels,
  getProviders,
  type Model,
  streamSimple,
} from "@mariozechner/pi-ai";
import type { CustomCommand } from "just-bash/browser";
import { ContextManager } from "./context/manager";
import {
  type Disposable,
  HookRegistry,
  readBeforeWritePostHook,
  readBeforeWritePreHook,
} from "./hooks";
import {
  agentMessagesToChatMessages,
  type ChatMessage,
  deriveStats,
  extractPartsFromAssistantMessage,
  generateId,
  type SessionStats,
} from "./message-utils";
import {
  loadOAuthCredentials,
  refreshOAuthToken,
  saveOAuthCredentials,
} from "./oauth";
import { PatternRegistry } from "./patterns/registry";
import type { ReasoningPattern } from "./patterns/types";
import {
  createUpdatePlanTool,
  type ExecutionPlan,
  PlanManager,
  TaskClassifier,
  type TaskRecord,
} from "./planning";
import {
  applyProxyToModel,
  buildCustomModel,
  loadSavedConfig,
  type ProviderConfig,
  saveConfig,
  type ThinkingLevel,
} from "./provider-config";
import { ReflectionEngine } from "./reflection/engine";
import {
  addSkill,
  getInstalledSkills,
  removeSkill,
  type SkillMeta,
  syncSkillsToVfs,
} from "./skills";
import { TaskTracker } from "./state/tracker";
import {
  type ChatSession,
  createSession,
  deleteSession,
  getOrCreateCurrentSession,
  getSession,
  listSessions,
  loadVfsFiles,
  saveSession,
  saveVfsFiles,
} from "./storage";
import {
  deletePlanRecords,
  deleteReflectionEntries,
  deleteTaskRecords,
  getLatestPlanRecord,
  getLatestTaskRecord,
} from "./storage/db";
import {
  deleteFile,
  listUploads,
  resetVfs,
  restoreVfs,
  setCustomCommands,
  setStaticFiles,
  snapshotVfs,
  writeFile,
} from "./vfs";

export interface RuntimeAdapter {
  tools: AgentTool[];
  buildSystemPrompt: (skills: SkillMeta[]) => string;
  getDocumentId: () => Promise<string>;
  getDocumentMetadata?: () => Promise<{
    metadata: object;
    nameMap?: Record<number, string>;
  } | null>;
  onToolResult?: (toolCallId: string, result: string, isError: boolean) => void;
  metadataTag?: string;
  staticFiles?: Record<string, string>;
  customCommands?: () => CustomCommand[];
  registerHooks?: (
    registry: HookRegistry,
  ) => Disposable | Disposable[] | undefined;
  getReasoningPatterns?: () => ReasoningPattern[];
}

export interface UploadedFile {
  name: string;
  size: number;
}

export interface RuntimeState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  providerConfig: ProviderConfig | null;
  sessionStats: SessionStats;
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  nameMap: Record<number, string>;
  uploads: UploadedFile[];
  isUploading: boolean;
  skills: SkillMeta[];
  vfsInvalidatedAt: number;
  activePlan: ExecutionPlan | null;
  activeTask: TaskRecord | null;
}

type StateListener = (state: RuntimeState) => void;

const INITIAL_STATS: SessionStats = { ...deriveStats([]), contextWindow: 0 };

function thinkingLevelToAgent(level: ThinkingLevel): AgentThinkingLevel {
  return level === "none" ? "off" : level;
}

export class AgentRuntime {
  private agent: Agent | null = null;
  private config: ProviderConfig | null = null;
  private pendingConfig: ProviderConfig | null = null;
  private streamingMessageId: string | null = null;
  private isStreaming = false;
  private documentId: string | null = null;
  private currentSessionId: string | null = null;
  private sessionLoaded = false;
  private followMode = true;
  private skills: SkillMeta[] = [];
  private adapter: RuntimeAdapter;
  private hookRegistry: HookRegistry;
  private adapterHookDisposables: Disposable[] = [];
  private taskClassifier = new TaskClassifier();
  private planManager = new PlanManager({ writeFile });
  private taskTracker = new TaskTracker();
  private reflectionEngine = new ReflectionEngine();
  private contextManager = new ContextManager();
  private patternRegistry = new PatternRegistry();
  private listeners: Set<StateListener> = new Set();
  private state: RuntimeState;

  constructor(adapter: RuntimeAdapter) {
    this.adapter = adapter;
    this.hookRegistry = new HookRegistry();
    this.hookRegistry.registerPre(readBeforeWritePreHook);
    this.hookRegistry.registerPost(readBeforeWritePostHook);
    this.syncAdapterHooks(adapter);
    this.syncAdapterPatterns(adapter);
    const saved = loadSavedConfig();
    const validConfig =
      saved?.provider && saved?.apiKey && saved?.model ? saved : null;
    this.followMode = validConfig?.followMode ?? true;
    this.state = {
      messages: [],
      isStreaming: false,
      error: null,
      providerConfig: validConfig,
      sessionStats: INITIAL_STATS,
      currentSession: null,
      sessions: [],
      nameMap: {},
      uploads: [],
      isUploading: false,
      skills: [],
      vfsInvalidatedAt: 0,
      activePlan: null,
      activeTask: null,
    };
  }

  getState(): RuntimeState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private update(partial: Partial<RuntimeState>) {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private bumpVfs() {
    this.update({ vfsInvalidatedAt: Date.now() });
  }

  private updateMessages(
    updater: (messages: ChatMessage[]) => ChatMessage[],
    extra?: Partial<RuntimeState>,
  ) {
    this.state = {
      ...this.state,
      messages: updater(this.state.messages),
      ...extra,
    };
    this.emit();
  }

  setAdapter(adapter: RuntimeAdapter) {
    if (this.adapter === adapter) return;
    this.adapter = adapter;
    this.syncAdapterHooks(adapter);
    this.syncAdapterPatterns(adapter);

    if (this.state.providerConfig && !this.isStreaming) {
      this.applyConfig(this.state.providerConfig);
    }
  }

  getAvailableProviders(): string[] {
    return getProviders();
  }

  getModelsForProvider(provider: string): Model<Api>[] {
    try {
      return (getModels as (p: string) => Model<Api>[])(provider);
    } catch {
      return [];
    }
  }

  private async getActiveApiKey(config: ProviderConfig): Promise<string> {
    if (config.authMethod !== "oauth") {
      return config.apiKey;
    }
    const creds = loadOAuthCredentials(config.provider);
    if (!creds) return config.apiKey;
    if (Date.now() < creds.expires) {
      return creds.access;
    }
    const refreshed = await refreshOAuthToken(
      config.provider,
      creds.refresh,
      config.proxyUrl,
      config.useProxy,
    );
    saveOAuthCredentials(config.provider, refreshed);
    return refreshed.access;
  }

  private handleAgentEvent = (event: AgentEvent) => {
    console.log("[Runtime] Agent event:", event.type, event);
    switch (event.type) {
      case "message_start": {
        if (event.message.role === "assistant") {
          const id = generateId();
          this.streamingMessageId = id;
          const parts = extractPartsFromAssistantMessage(event.message);
          const chatMessage: ChatMessage = {
            id,
            role: "assistant",
            parts,
            timestamp: event.message.timestamp,
          };
          this.updateMessages((msgs) => [...msgs, chatMessage]);
        }
        break;
      }
      case "message_update": {
        if (event.message.role === "assistant" && this.streamingMessageId) {
          const streamId = this.streamingMessageId;
          this.updateMessages((msgs) => {
            const messages = [...msgs];
            const idx = messages.findIndex((m) => m.id === streamId);
            if (idx !== -1) {
              const parts = extractPartsFromAssistantMessage(
                event.message,
                messages[idx].parts,
              );
              messages[idx] = { ...messages[idx], parts };
            }
            return messages;
          });
        }
        break;
      }
      case "message_end": {
        if (event.message.role === "assistant") {
          const assistantMsg = event.message as AssistantMessage;
          const isError =
            assistantMsg.stopReason === "error" ||
            assistantMsg.stopReason === "aborted";
          const streamId = this.streamingMessageId;

          this.updateMessages(
            (msgs) => {
              const messages = [...msgs];
              const idx = messages.findIndex((m) => m.id === streamId);

              if (isError) {
                if (idx !== -1) {
                  messages.splice(idx, 1);
                }
              } else if (idx !== -1) {
                const parts = extractPartsFromAssistantMessage(
                  event.message,
                  messages[idx].parts,
                );
                messages[idx] = { ...messages[idx], parts };
              }
              return messages;
            },
            {
              error: isError
                ? assistantMsg.errorMessage || "Request failed"
                : this.state.error,
              sessionStats: isError
                ? this.state.sessionStats
                : {
                    ...deriveStats(this.agent?.state.messages ?? []),
                    contextWindow: this.state.sessionStats.contextWindow,
                  },
            },
          );
          this.streamingMessageId = null;
        }
        break;
      }
      case "tool_execution_start": {
        this.updateMessages((msgs) => {
          const messages = [...msgs];
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const partIdx = msg.parts.findIndex(
              (p) => p.type === "toolCall" && p.id === event.toolCallId,
            );
            if (partIdx !== -1) {
              const parts = [...msg.parts];
              const part = parts[partIdx];
              if (part.type === "toolCall") {
                parts[partIdx] = { ...part, status: "running" };
                messages[i] = { ...msg, parts };
              }
              break;
            }
          }
          return messages;
        });
        break;
      }
      case "tool_execution_update": {
        this.updateMessages((msgs) => {
          const messages = [...msgs];
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const partIdx = msg.parts.findIndex(
              (p) => p.type === "toolCall" && p.id === event.toolCallId,
            );
            if (partIdx !== -1) {
              const parts = [...msg.parts];
              const part = parts[partIdx];
              if (part.type === "toolCall") {
                let partialText: string;
                if (typeof event.partialResult === "string") {
                  partialText = event.partialResult;
                } else if (
                  event.partialResult?.content &&
                  Array.isArray(event.partialResult.content)
                ) {
                  partialText = event.partialResult.content
                    .filter((c: { type: string }) => c.type === "text")
                    .map((c: { text: string }) => c.text)
                    .join("\n");
                } else {
                  partialText = JSON.stringify(event.partialResult, null, 2);
                }
                parts[partIdx] = { ...part, result: partialText };
                messages[i] = { ...msg, parts };
              }
              break;
            }
          }
          return messages;
        });
        break;
      }
      case "tool_execution_end": {
        let resultText: string;
        let resultImages: { data: string; mimeType: string }[] | undefined;
        if (typeof event.result === "string") {
          resultText = event.result;
        } else if (
          event.result?.content &&
          Array.isArray(event.result.content)
        ) {
          resultText = event.result.content
            .filter((c: { type: string }) => c.type === "text")
            .map((c: { text: string }) => c.text)
            .join("\n");
          const images = event.result.content
            .filter((c: { type: string }) => c.type === "image")
            .map((c: { data: string; mimeType: string }) => ({
              data: c.data,
              mimeType: c.mimeType,
            }));
          if (images.length > 0) resultImages = images;
        } else {
          resultText = JSON.stringify(event.result, null, 2);
        }

        if (!event.isError && this.followMode) {
          this.adapter.onToolResult?.(event.toolCallId, resultText, false);
        }

        this.updateMessages((msgs) => {
          const messages = [...msgs];
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const partIdx = msg.parts.findIndex(
              (p) => p.type === "toolCall" && p.id === event.toolCallId,
            );
            if (partIdx !== -1) {
              const parts = [...msg.parts];
              const part = parts[partIdx];
              if (part.type === "toolCall") {
                parts[partIdx] = {
                  ...part,
                  status: event.isError ? "error" : "complete",
                  result: resultText,
                  images: resultImages,
                };
                messages[i] = { ...msg, parts };
              }
              break;
            }
          }
          return messages;
        });
        break;
      }
      case "agent_end": {
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.update({ isStreaming: false });
        this.onStreamingEnd();
        break;
      }
    }
  };

  applyConfig(config: ProviderConfig) {
    let contextWindow = 0;
    let baseModel: Model<Api>;
    if (config.provider === "custom") {
      const custom = buildCustomModel(config);
      if (!custom) return;
      baseModel = custom;
    } else {
      try {
        baseModel = (getModel as (p: string, m: string) => Model<Api>)(
          config.provider,
          config.model,
        );
      } catch {
        return;
      }
    }
    contextWindow = baseModel.contextWindow;
    this.config = config;

    const proxiedModel = applyProxyToModel(baseModel, config);
    const existingMessages = this.agent?.state.messages ?? [];

    if (this.agent) {
      this.agent.abort();
    }

    const systemPrompt = this.adapter.buildSystemPrompt(this.skills);

    const agent = new Agent({
      initialState: {
        model: proxiedModel,
        systemPrompt,
        thinkingLevel: thinkingLevelToAgent(config.thinking),
        tools: [
          createUpdatePlanTool(this.planManager),
          ...this.hookRegistry.wrapTools(this.adapter.tools),
        ],
        messages: existingMessages,
      },
      streamFn: async (model, context, options) => {
        const cfg = this.config ?? config;
        const apiKey = await this.getActiveApiKey(cfg);
        return streamSimple(model, context, {
          ...options,
          apiKey,
        });
      },
    });
    this.agent = agent;
    agent.subscribe(this.handleAgentEvent);
    this.pendingConfig = null;
    this.followMode = config.followMode ?? true;

    this.update({
      providerConfig: config,
      error: null,
      sessionStats: {
        ...this.state.sessionStats,
        contextWindow,
      },
    });
  }

  setProviderConfig(config: ProviderConfig) {
    if (this.isStreaming) {
      this.pendingConfig = config;
      this.update({ providerConfig: config });
      return;
    }
    this.applyConfig(config);
  }

  abort() {
    this.agent?.abort();
    this.isStreaming = false;
    this.update({ isStreaming: false });
  }

  async sendMessage(content: string, attachments?: string[]) {
    if (this.pendingConfig) {
      this.applyConfig(this.pendingConfig);
    }
    const agent = this.agent;
    if (!agent || !this.state.providerConfig) {
      this.update({ error: "Please configure your API key first" });
      return;
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      parts: [{ type: "text", text: content }],
      timestamp: Date.now(),
    };

    this.isStreaming = true;
    this.update({
      messages: [...this.state.messages, userMessage],
      isStreaming: true,
      error: null,
    });

    try {
      let promptContent = content;

      if (this.adapter.getDocumentMetadata) {
        try {
          const meta = await this.adapter.getDocumentMetadata();
          if (meta) {
            const tag = this.adapter.metadataTag || "doc_context";
            promptContent = `<${tag}>\n${JSON.stringify(meta.metadata, null, 2)}\n</${tag}>\n\n${content}`;
            if (meta.nameMap) {
              this.update({ nameMap: meta.nameMap });
            }
          }
        } catch (err) {
          console.error("[Runtime] Failed to get document metadata:", err);
        }
      }

      if (attachments && attachments.length > 0) {
        const paths = attachments
          .map((name) => `/home/user/uploads/${name}`)
          .join("\n");
        promptContent = `<attachments>\n${paths}\n</attachments>\n\n${promptContent}`;
      }

      const classification = await this.taskClassifier.classify(content);
      const activePlan = classification.needsPlan
        ? await this.planManager.createPlan(content, classification)
        : this.planManager.hydrate(null);
      this.reflectionEngine = new ReflectionEngine();
      const activeTask = this.taskTracker.beginTask(content, classification, {
        planId: activePlan?.id,
      });
      this.patternRegistry.deactivateAll();
      this.patternRegistry.activateMatching(
        this.hookRegistry,
        classification,
        activePlan ?? undefined,
      );

      this.update({
        activePlan,
        activeTask,
      });

      if (activePlan) {
        promptContent = `${this.planManager.formatPlanForPrompt(activePlan)}\n\n${promptContent}`;
      }

      const contextUsagePct =
        this.state.sessionStats.contextWindow > 0
          ? Math.round(
              (this.state.sessionStats.lastInputTokens /
                this.state.sessionStats.contextWindow) *
                100,
            )
          : 0;
      const contextAction =
        this.contextManager.getActionForUsage(contextUsagePct);
      if (contextAction !== "none") {
        promptContent = `<context_budget action="${contextAction}" usage_pct="${contextUsagePct}" />\n\n${promptContent}`;
      }

      const hookNotes = this.hookRegistry.drainPromptNotes();
      if (hookNotes.length > 0) {
        const noteText = hookNotes
          .map((note) => `[${note.level.toUpperCase()}] ${note.text}`)
          .join("\n");
        promptContent = `<hook_notes>\n${noteText}\n</hook_notes>\n\n${promptContent}`;
      }

      await agent.prompt(promptContent);
    } catch (err) {
      console.error("[Runtime] sendMessage error:", err);
      this.isStreaming = false;
      this.update({
        isStreaming: false,
        error: err instanceof Error ? err.message : "An error occurred",
        activePlan: this.planManager.getActivePlan(),
        activeTask: this.taskTracker.failTask(
          err instanceof Error ? err.message : "An error occurred",
        ),
      });
    }
  }

  clearMessages() {
    this.abort();
    this.agent?.reset();
    resetVfs();
    this.hookRegistry.resetSessionState();
    this.planManager.hydrate(null);
    this.taskTracker.reset();
    this.patternRegistry.deactivateAll();
    if (this.currentSessionId) {
      Promise.all([
        saveSession(this.currentSessionId, []),
        saveVfsFiles(this.currentSessionId, []),
        deletePlanRecords(this.currentSessionId),
        deleteTaskRecords(this.currentSessionId),
        deleteReflectionEntries(this.currentSessionId),
      ]).catch(console.error);
    }
    this.update({
      messages: [],
      error: null,
      sessionStats: INITIAL_STATS,
      uploads: [],
      activePlan: null,
      activeTask: null,
    });
  }

  private async refreshSessions() {
    if (!this.documentId) return;
    const sessions = await listSessions(this.documentId);
    this.update({ sessions });
  }

  async newSession() {
    if (!this.documentId) return;
    if (this.isStreaming) return;
    try {
      this.agent?.reset();
      resetVfs();
      this.hookRegistry.resetSessionState();
      this.planManager.hydrate(null);
      this.taskTracker.reset();
      this.patternRegistry.deactivateAll();
      const session = await createSession(this.documentId);
      this.currentSessionId = session.id;
      await this.refreshSessions();
      this.update({
        messages: [],
        currentSession: session,
        error: null,
        sessionStats: INITIAL_STATS,
        uploads: [],
        activePlan: null,
        activeTask: null,
      });
    } catch (err) {
      console.error("[Runtime] Failed to create session:", err);
    }
  }

  async switchSession(sessionId: string) {
    if (this.currentSessionId === sessionId) return;
    if (this.isStreaming) return;
    this.agent?.reset();
    this.hookRegistry.resetSessionState();
    this.patternRegistry.deactivateAll();
    try {
      const [session, vfsFiles, latestPlan, latestTask] = await Promise.all([
        getSession(sessionId),
        loadVfsFiles(sessionId),
        getLatestPlanRecord(sessionId),
        getLatestTaskRecord(sessionId),
      ]);
      if (!session) return;
      await restoreVfs(vfsFiles);
      this.currentSessionId = session.id;
      const activePlan = this.planManager.hydrate(latestPlan);
      const activeTask = this.taskTracker.hydrate(latestTask);
      this.activateRestoredPatterns(activePlan);

      if (session.agentMessages.length > 0 && this.agent) {
        this.agent.replaceMessages(session.agentMessages);
      }

      const uploadNames = await listUploads();
      const stats = deriveStats(session.agentMessages);
      this.update({
        messages: agentMessagesToChatMessages(
          session.agentMessages,
          this.adapter.metadataTag,
        ),
        currentSession: session,
        error: null,
        sessionStats: {
          ...stats,
          contextWindow: this.state.sessionStats.contextWindow,
        },
        uploads: uploadNames.map((name) => ({ name, size: 0 })),
        activePlan,
        activeTask,
      });
      await this.refreshNameMap();
    } catch (err) {
      console.error("[Runtime] Failed to switch session:", err);
    }
  }

  async deleteCurrentSession() {
    if (!this.currentSessionId || !this.documentId) return;
    if (this.isStreaming) return;
    this.agent?.reset();
    this.hookRegistry.resetSessionState();
    this.planManager.hydrate(null);
    this.taskTracker.reset();
    this.patternRegistry.deactivateAll();
    const deletedId = this.currentSessionId;
    await Promise.all([
      deleteSession(deletedId),
      saveVfsFiles(deletedId, []),
      deletePlanRecords(deletedId),
      deleteTaskRecords(deletedId),
      deleteReflectionEntries(deletedId),
    ]);
    const session = await getOrCreateCurrentSession(this.documentId);
    this.currentSessionId = session.id;
    const [vfsFiles, latestPlan, latestTask] = await Promise.all([
      loadVfsFiles(session.id),
      getLatestPlanRecord(session.id),
      getLatestTaskRecord(session.id),
    ]);
    await restoreVfs(vfsFiles);
    const activePlan = this.planManager.hydrate(latestPlan);
    const activeTask = this.taskTracker.hydrate(latestTask);
    this.activateRestoredPatterns(activePlan);

    if (session.agentMessages.length > 0 && this.agent) {
      this.agent.replaceMessages(session.agentMessages);
    }

    await this.refreshSessions();
    const uploadNames = await listUploads();
    const stats = deriveStats(session.agentMessages);
    this.update({
      messages: agentMessagesToChatMessages(
        session.agentMessages,
        this.adapter.metadataTag,
      ),
      currentSession: session,
      error: null,
      sessionStats: {
        ...stats,
        contextWindow: this.state.sessionStats.contextWindow,
      },
      uploads: uploadNames.map((name) => ({ name, size: 0 })),
      activePlan,
      activeTask,
    });
  }

  private async onStreamingEnd() {
    if (!this.currentSessionId) return;
    const sessionId = this.currentSessionId;
    const agentMessages = this.agent?.state.messages ?? [];
    try {
      const taskSummary = this.state.error
        ? this.state.error
        : "Agent execution completed.";
      const activeTask = this.state.error
        ? this.taskTracker.failTask(taskSummary)
        : this.taskTracker.completeTask(taskSummary);
      if (activeTask) {
        await this.reflectionEngine.taskReflect({
          taskId: activeTask.id,
          summary: taskSummary,
        });
      }
      const vfsFiles = await snapshotVfs();
      await Promise.all([
        saveSession(sessionId, agentMessages),
        saveVfsFiles(sessionId, vfsFiles),
        this.planManager.persist(sessionId),
        this.taskTracker.persist(sessionId),
        this.reflectionEngine.persist(sessionId),
      ]);
      await this.refreshSessions();
      const updated = await getSession(sessionId);
      if (updated) {
        this.update({
          currentSession: updated,
          activePlan: this.planManager.getActivePlan(),
          activeTask,
        });
      }
      this.bumpVfs();
    } catch (e) {
      console.error(e);
    }
  }

  async init() {
    if (this.sessionLoaded) return;
    this.sessionLoaded = true;

    if (this.adapter.staticFiles) {
      setStaticFiles(this.adapter.staticFiles);
    }
    if (this.adapter.customCommands) {
      setCustomCommands(this.adapter.customCommands);
    }

    try {
      const id = await this.adapter.getDocumentId();
      this.documentId = id;

      const skills = await getInstalledSkills();
      this.skills = skills;
      await syncSkillsToVfs();

      const saved = loadSavedConfig();
      if (saved?.provider && saved?.apiKey && saved?.model) {
        this.applyConfig(saved);
      }

      const session = await getOrCreateCurrentSession(id);
      this.currentSessionId = session.id;
      const [sessions, vfsFiles, latestPlan, latestTask] = await Promise.all([
        listSessions(id),
        loadVfsFiles(session.id),
        getLatestPlanRecord(session.id),
        getLatestTaskRecord(session.id),
      ]);
      if (vfsFiles.length > 0) {
        await restoreVfs(vfsFiles);
      }
      const activePlan = this.planManager.hydrate(latestPlan);
      const activeTask = this.taskTracker.hydrate(latestTask);
      this.activateRestoredPatterns(activePlan);

      if (session.agentMessages.length > 0 && this.agent) {
        this.agent.replaceMessages(session.agentMessages);
      }

      const uploadNames = await listUploads();
      const stats = deriveStats(session.agentMessages);
      this.update({
        messages: agentMessagesToChatMessages(
          session.agentMessages,
          this.adapter.metadataTag,
        ),
        currentSession: session,
        sessions,
        skills,
        sessionStats: {
          ...stats,
          contextWindow: this.state.sessionStats.contextWindow,
        },
        uploads: uploadNames.map((name) => ({ name, size: 0 })),
        activePlan,
        activeTask,
      });
      await this.refreshNameMap();
    } catch (err) {
      console.error("[Runtime] Failed to load session:", err);
    }
  }

  async uploadFiles(files: { name: string; size: number; data: Uint8Array }[]) {
    if (files.length === 0) return;
    this.update({ isUploading: true });
    try {
      for (const file of files) {
        await writeFile(file.name, file.data);
        const uploads = [...this.state.uploads];
        const exists = uploads.findIndex((u) => u.name === file.name);
        if (exists !== -1) {
          uploads[exists] = { name: file.name, size: file.size };
        } else {
          uploads.push({ name: file.name, size: file.size });
        }
        this.update({ uploads });
      }
      if (this.currentSessionId) {
        const snapshot = await snapshotVfs();
        await saveVfsFiles(this.currentSessionId, snapshot);
      }
      this.bumpVfs();
    } catch (err) {
      console.error("Failed to upload file:", err);
    } finally {
      this.update({ isUploading: false });
    }
  }

  async removeUpload(name: string) {
    try {
      await deleteFile(name);
      this.update({
        uploads: this.state.uploads.filter((u) => u.name !== name),
      });
      if (this.currentSessionId) {
        const snapshot = await snapshotVfs();
        await saveVfsFiles(this.currentSessionId, snapshot);
      }
      this.bumpVfs();
    } catch (err) {
      console.error("Failed to delete file:", err);
      this.update({
        uploads: this.state.uploads.filter((u) => u.name !== name),
      });
    }
  }

  private async refreshSkillsAndRebuildAgent() {
    this.skills = await getInstalledSkills();
    this.update({ skills: this.skills });
    if (this.state.providerConfig) {
      this.applyConfig(this.state.providerConfig);
    }
  }

  async installSkill(inputs: { path: string; data: Uint8Array }[]) {
    if (inputs.length === 0) return;
    try {
      await addSkill(inputs);
      await this.refreshSkillsAndRebuildAgent();
    } catch (err) {
      console.error("[Runtime] Failed to install skill:", err);
      this.update({
        error: err instanceof Error ? err.message : "Failed to install skill",
      });
    }
  }

  async uninstallSkill(name: string) {
    try {
      await removeSkill(name);
      await this.refreshSkillsAndRebuildAgent();
    } catch (err) {
      console.error("[Runtime] Failed to uninstall skill:", err);
    }
  }

  toggleFollowMode() {
    if (!this.state.providerConfig) return;
    const newFollowMode = !this.state.providerConfig.followMode;
    this.followMode = newFollowMode;
    const newConfig = {
      ...this.state.providerConfig,
      followMode: newFollowMode,
    };
    saveConfig(newConfig);
    this.update({ providerConfig: newConfig });
  }

  toggleExpandToolCalls() {
    if (!this.state.providerConfig) return;
    const newConfig = {
      ...this.state.providerConfig,
      expandToolCalls: !this.state.providerConfig.expandToolCalls,
    };
    saveConfig(newConfig);
    this.update({ providerConfig: newConfig });
  }

  getName(id: number): string | undefined {
    return this.state.nameMap[id];
  }

  private async refreshNameMap() {
    if (!this.adapter.getDocumentMetadata) return;
    try {
      const meta = await this.adapter.getDocumentMetadata();
      if (meta?.nameMap) {
        this.update({ nameMap: meta.nameMap });
      }
    } catch (err) {
      console.error("[Runtime] Failed to refresh nameMap:", err);
    }
  }

  dispose() {
    this.agent?.abort();
    this.clearAdapterHooks();
    this.patternRegistry.deactivateAll();
    this.listeners.clear();
  }

  private clearAdapterHooks() {
    for (const disposable of this.adapterHookDisposables) {
      disposable.dispose();
    }
    this.adapterHookDisposables = [];
  }

  private syncAdapterHooks(adapter: RuntimeAdapter) {
    this.clearAdapterHooks();

    const registration = adapter.registerHooks?.(this.hookRegistry);
    if (!registration) return;

    this.adapterHookDisposables = Array.isArray(registration)
      ? registration
      : [registration];
  }

  private syncAdapterPatterns(adapter: RuntimeAdapter) {
    this.patternRegistry.deactivateAll();
    this.patternRegistry = new PatternRegistry();

    for (const pattern of adapter.getReasoningPatterns?.() ?? []) {
      this.patternRegistry.register(pattern);
    }
  }

  private activateRestoredPatterns(plan: ExecutionPlan | null) {
    this.patternRegistry.deactivateAll();
    if (!plan) return;

    this.patternRegistry.activateMatching(
      this.hookRegistry,
      plan.classification,
      plan,
    );
  }
}
