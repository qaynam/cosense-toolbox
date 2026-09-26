<script lang="ts">
  let { start = 0, step = 1 }: { start?: number; step?: number } = $props()
  let count = $state(start)
</script>

<button
  type="button"
  class="counter rounded border border-gray-400 px-2 py-0.5 hover:bg-gray-100"
  onclick={() => (count += step)}
>
  count: {count}
</button>
