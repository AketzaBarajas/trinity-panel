<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		x,
		y,
		width,
		children
	}: { x: number; y: number; width: number; children: Snippet } = $props();

	// Cerca del borde derecho se abre hacia la izquierda.
	const flip = $derived(x > width - 220);
</script>

<div class="tip" class:flip style:left="{x}px" style:top="{y}px" role="tooltip">
	{@render children()}
</div>

<style>
	.tip {
		position: absolute;
		z-index: 5;
		pointer-events: none;
		transform: translate(14px, -50%);
		min-width: 150px;
		padding: 9px 11px;
		border-radius: var(--r-sm);
		border: 1px solid var(--line-2);
		background: var(--bg-raised);
		box-shadow: 0 14px 34px -14px rgba(0, 0, 0, 0.6);
		font-size: 12px;
		color: var(--ink);
		white-space: nowrap;
		animation: tip-in 120ms ease-out;
	}

	.tip.flip {
		transform: translate(calc(-100% - 14px), -50%);
	}

	@keyframes tip-in {
		from {
			opacity: 0;
		}
	}

	.tip :global(.t-title) {
		display: block;
		margin-bottom: 6px;
		color: var(--ink-2);
	}

	.tip :global(.t-title::first-letter) {
		text-transform: uppercase;
	}

	.tip :global(.t-row) {
		display: flex;
		align-items: center;
		gap: 8px;
		line-height: 1.7;
	}

	.tip :global(.t-row .t-dot) {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
	}

	.tip :global(.t-row .t-val) {
		margin-left: auto;
		padding-left: 14px;
		font-variant-numeric: tabular-nums;
		font-weight: 500;
	}

	.tip :global(.t-total) {
		margin-top: 5px;
		padding-top: 5px;
		border-top: 1px solid var(--line);
	}
</style>
