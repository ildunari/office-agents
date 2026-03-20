<script lang="ts">
  import {
    CheckCircle2,
    ChevronDown,
    Circle,
    Clock3,
    Minus,
    XCircle,
  } from "lucide-svelte";
  import {
    getPlanProgress,
    statusLabel,
    stepLabel,
    type PlanChecklistPlan,
    type PlanChecklistStep,
    type PlanChecklistTask,
  } from "./plan-checklist";

  interface Props {
    plan: PlanChecklistPlan | null;
    task?: PlanChecklistTask | null;
    initiallyExpanded?: boolean;
  }

  let { plan, task = null, initiallyExpanded }: Props = $props();
  let expanded = $state(false);
  let lastPlanKey = $state<string | null>(null);

  const steps = $derived(plan?.steps ?? []);
  const progress = $derived(getPlanProgress(plan));

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
            {statusLabel(task?.status ?? plan.status)}
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
      </div>
    {/if}
  </div>
{/if}
