<script lang="ts">
  interface Props {
    message: string | null;
  }

  let { message }: Props = $props();
</script>

{#if message}
  <div class="mx-3 mt-3 border border-(--chat-border) bg-(--chat-warning-bg) rounded-sm px-3 py-2 text-xs text-(--chat-warning)">
    {message}
  </div>
{/if}
