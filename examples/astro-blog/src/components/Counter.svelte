<script lang="ts">
  let { start = 0, step = 1 }: { start?: number; step?: number } = $props()
  let count = $state(start)
</script>

<button type="button" class="counter" onclick={() => (count += step)}>
  count: {count}
</button>
