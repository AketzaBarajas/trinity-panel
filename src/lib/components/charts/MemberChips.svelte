<script lang="ts">
	import { team } from '#lib/team.svelte.ts';
	import { memberColor } from '#lib/palette.ts';

	let { value = $bindable<string | null>(null), label }: { value?: string | null; label: string } = $props();
</script>

<div class="chips" role="group" aria-label={label}>
	<button type="button" class="chip" aria-pressed={value === null} onclick={() => (value = null)}>Todos</button>
	{#each team.members as m (m.id)}
		<button
			type="button"
			class="chip"
			aria-pressed={value === m.id}
			style:--c={memberColor(m.color)}
			onclick={() => (value = value === m.id ? null : m.id)}
		>
			<span class="dot" aria-hidden="true"></span>{m.display_name}
		</button>
	{/each}
</div>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 26px;
		padding: 0 10px;
		border-radius: 999px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--ink-3);
		font-size: 12px;
		cursor: pointer;
		transition:
			color 150ms ease,
			border-color 150ms ease,
			background-color 150ms ease,
			transform 120ms var(--ease-out);
	}

	.chip:active {
		transform: scale(0.96);
	}

	.chip[aria-pressed='true'] {
		color: var(--ink);
		border-color: var(--line-2);
		background: var(--bg-raised);
	}

	@media (hover: hover) and (pointer: fine) {
		.chip:hover {
			color: var(--ink);
		}
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--c);
	}
</style>
