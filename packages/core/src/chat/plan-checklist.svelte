<script lang="ts">
  import {
    CheckCircle2,
    ChevronDown,
    Circle,
    Clock3,
    AlertTriangle,
    BadgeAlert,
    Minus,
    Play,
    RefreshCcw,
    ShieldAlert,
    ShieldCheck,
    XCircle,
  } from "lucide-svelte";
  import { getChatContext } from "./chat-runtime-context";
  import {
    contextBudgetLabel,
    incompleteVerificationCount,
    modeLabel,
    shouldShowApprove,
    shouldShowResume,
    getPlanProgress,
    statusLabel,
    stepLabel,
    verificationLabel,
    type PlanChecklistApproval,
    type PlanChecklistContextBudget,
    type PlanChecklistPlan,
    type PlanChecklistPattern,
    type PlanChecklistStep,
    type PlanChecklistTask,
    type PlanChecklistVerification,
  } from "./plan-checklist";

  interface Props {
    plan: PlanChecklistPlan | null;
    task?: PlanChecklistTask | null;
    mode?: string | null;
    approval?: PlanChecklistApproval | null;
    verification?: PlanChecklistVerification | null;
    degradedGuardrails?: string[];
    activePatterns?: PlanChecklistPattern[];
    activeHookNames?: string[];
    contextBudget?: PlanChecklistContextBudget | null;
    lastPromptNotes?: string[];
    initiallyExpanded?: boolean;
  }

  let {
    plan,
    task = null,
    mode = null,
    approval = null,
    verification = null,
    degradedGuardrails = [],
    activePatterns = [],
    activeHookNames = [],
    contextBudget = null,
    lastPromptNotes = [],
    initiallyExpanded,
  }: Props = $props();
  const chat = getChatContext();
  let expanded = $state(false);
  let debugExpanded = $state(false);
  let lastPlanKey = $state<string | null>(null);

  const steps = $derived(plan?.steps ?? []);
  const progress = $derived(getPlanProgress(plan));
  const showApprove = $derived(shouldShowApprove(mode, approval));
  const showResume = $derived(shouldShowResume(mode, task));
  const verifierCount = $derived(incompleteVerificationCount(task));

  $effect(() => {
    const nextPlanKey = plan
      ? [plan.summary, plan.userRequest, plan.status, plan.steps?.length].join(
          "|",
        )
      : null;

    if (nextPlanKey !== lastPlanKey) {
      lastPlanKey = nextPlanKey;
      expanded =
        initiallyExpanded ??
        (plan?.status === "active" || task?.status === "in_progress");
    }
  });
</script>

{#if plan}
  <div class="border-b border-(--chat-border) bg-(--chat-bg-secondary)">
    <button
      type="button"
      class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-(--chat-bg)"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <ChevronDown
        size={14}
        class={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-(--chat-text-muted)">
          <span>Plan</span>
          <span class="rounded-full border border-(--chat-border) px-1.5 py-0.5 text-[9px] text-(--chat-text-secondary)">
            {modeLabel(mode || task?.status || plan.status)}
          </span>
        </div>
        <div class="truncate text-sm text-(--chat-text-primary)">
          {plan.summary || plan.userRequest || "Execution plan"}
        </div>
      </div>
      <div class="shrink-0 text-[10px] text-(--chat-text-muted)">
        {progress.completed} / {progress.total} complete
      </div>
    </button>

    {#if expanded}
      <div class="px-3 pb-3">
        {#if showApprove && approval}
          <div class="mb-2 rounded-sm border border-(--chat-warning) bg-(--chat-warning-bg) px-2 py-2 text-xs text-(--chat-warning)">
            <div class="flex items-start gap-2">
              <ShieldAlert size={14} class="mt-0.5 shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="font-medium">Approval required</div>
                <div>{approval.reason || "High-risk changes are paused for approval."}</div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-sm border border-(--chat-warning) px-2 py-1 text-[10px] uppercase tracking-wider hover:bg-(--chat-bg)"
                onclick={() => void chat.approveActivePlan()}
              >
                <span class="inline-flex items-center gap-1">
                  <ShieldCheck size={10} />
                  Approve
                </span>
              </button>
            </div>
          </div>
        {/if}

        {#if showResume && task?.handoff}
          <div class="mb-2 rounded-sm border border-(--chat-accent) bg-(--chat-bg) px-2 py-2 text-xs">
            <div class="flex items-start gap-2">
              <RefreshCcw size={14} class="mt-0.5 shrink-0 text-(--chat-accent)" />
              <div class="min-w-0 flex-1">
                <div class="font-medium text-(--chat-text-primary)">Blocked handoff</div>
                <div class="text-(--chat-text-secondary)">
                  {task.handoff.summary || task.handoff.nextRecommendedAction}
                </div>
                {#if verifierCount > 0}
                  <div class="mt-1 text-(--chat-text-muted)">
                    {verifierCount} verification item{verifierCount === 1 ? "" : "s"} still need attention
                  </div>
                {/if}
              </div>
              <button
                type="button"
                class="shrink-0 rounded-sm border border-(--chat-accent) px-2 py-1 text-[10px] uppercase tracking-wider hover:bg-(--chat-bg-secondary)"
                onclick={() => void chat.resumeFromHandoff()}
              >
                <span class="inline-flex items-center gap-1">
                  <Play size={10} />
                  Resume
                </span>
              </button>
            </div>
          </div>
        {/if}

        {#if verification}
          <div class="mb-2 rounded-sm border border-(--chat-border) bg-(--chat-bg) px-2 py-1.5 text-xs">
            <div class="flex items-center gap-2 text-(--chat-text-primary)">
              <BadgeAlert size={12} class="shrink-0" />
              <span class="font-medium">Verifier</span>
              <span class="text-(--chat-text-secondary)">
                {verificationLabel(verification)}
              </span>
            </div>
          </div>
        {/if}

        {#if degradedGuardrails.length > 0}
          <div class="mb-2 space-y-1">
            {#each degradedGuardrails as warning, idx (`warning-${idx}`)}
              <div class="rounded-sm border border-(--chat-warning) bg-(--chat-warning-bg) px-2 py-1 text-xs text-(--chat-warning)">
                <span class="inline-flex items-start gap-2">
                  <AlertTriangle size={12} class="mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </span>
              </div>
            {/each}
          </div>
        {/if}

        <div class="mb-2 h-1.5 overflow-hidden rounded-full bg-(--chat-border)">
          <div
            class="h-full bg-(--chat-accent) transition-all"
            style={`width: ${progress.percent}%`}
          ></div>
        </div>

        <div class="space-y-1">
          {#each steps as step (step.id)}
            <div class="flex items-start gap-2 rounded-sm border border-(--chat-border) bg-(--chat-bg) px-2 py-1.5">
              <div class="mt-0.5 shrink-0 text-(--chat-text-muted)">
                {#if step.status === "completed"}
                  <CheckCircle2 size={12} class="text-green-500" />
                {:else if step.status === "active"}
                  <Clock3 size={12} class="text-(--chat-accent)" />
                {:else if step.status === "failed"}
                  <XCircle size={12} class="text-(--chat-error)" />
                {:else if step.status === "skipped"}
                  <Minus size={12} class="text-(--chat-warning)" />
                {:else}
                  <Circle size={12} />
                {/if}
              </div>

              <div class="min-w-0 flex-1">
                <div class="text-xs text-(--chat-text-primary)">
                  {stepLabel(step)}
                </div>
                <div class="text-[10px] uppercase tracking-wider text-(--chat-text-muted)">
                  {statusLabel(step.status)}
                </div>
              </div>
            </div>
          {/each}
        </div>

        <div class="mt-3 border-t border-(--chat-border) pt-2">
          <button
            type="button"
            class="text-[10px] uppercase tracking-wider text-(--chat-text-muted) hover:text-(--chat-text-primary)"
            onclick={() => (debugExpanded = !debugExpanded)}
          >
            {debugExpanded ? "Hide" : "Show"} debug
          </button>

          {#if debugExpanded}
            <div class="mt-2 space-y-2 text-xs text-(--chat-text-secondary)">
              <div>
                <div class="font-medium text-(--chat-text-primary)">Active patterns</div>
                <div>{activePatterns.length > 0 ? activePatterns.map((pattern) => `${pattern.id}: ${pattern.reason}`).join(" | ") : "none"}</div>
              </div>
              <div>
                <div class="font-medium text-(--chat-text-primary)">Active hooks</div>
                <div>{activeHookNames.length > 0 ? activeHookNames.join(", ") : "none"}</div>
              </div>
              <div>
                <div class="font-medium text-(--chat-text-primary)">Context budget</div>
                <div>{contextBudgetLabel(contextBudget)}</div>
              </div>
              <div>
                <div class="font-medium text-(--chat-text-primary)">Last prompt notes</div>
                <div>{lastPromptNotes.length > 0 ? lastPromptNotes.join(" | ") : "none"}</div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
