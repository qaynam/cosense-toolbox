<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    type = "note",
    title,
    children,
  }: { type?: "note" | "warn"; title?: string; children?: Snippet } = $props()
</script>

<aside class="callout callout-{type}">
  {#if title}<p class="callout-title">{title}</p>{/if}
  {@render children?.()}
</aside>

<style>
  .callout {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid #3b82f6;
    background: #eff6ff;
  }
  .callout-warn {
    border-color: #f59e0b;
    background: #fffbeb;
  }
  .callout-title {
    margin: 0 0 0.25em;
    font-weight: bold;
  }
</style>
