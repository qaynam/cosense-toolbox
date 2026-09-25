<script lang="ts">
import type { Snippet } from "svelte";

 let { children}: { children: Snippet } = $props()

 let isShow = $state(false)
</script>

<div>
  {#if isShow}
    <dialog open={isShow} class="modal">
      <div class="modal-content">
        {@render children()}
        <button onclick={() => (isShow = false)}>Close</button>
      </div>
    </dialog>
  {/if}
<button onclick={() => (isShow = true)}>Open Modal {isShow}</button>
</div>

<style>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal-content {
  background-color: white;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }

</style>
