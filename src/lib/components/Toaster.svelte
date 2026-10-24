<script lang="ts">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { toasts } from '#lib/toast.svelte.ts';

	onMount(() => {
		const vis = () => (document.visibilityState === 'hidden' ? toasts.pause() : toasts.resume());
		document.addEventListener('visibilitychange', vis);
		return () => document.removeEventListener('visibilitychange', vis);
	});

	const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Entra desde abajo (de donde está el borde) y sale por el mismo sitio, más rápido.
	function slide(_node: Element, { dur, y }: { dur: number; y: number }) {
		return {
			duration: dur,
			easing: cubicOut,
			css: (t: number) =>
				reduce ? `opacity:${t}` : `opacity:${t};transform:translateY(${(1 - t) * y}px) scale(${0.97 + t * 0.03})`
		};
	}
</script>

<div
	class="toaster"
	role="region"
	aria-label="Avisos"
	onpointerenter={() => toasts.pause()}
	onpointerleave={() => toasts.resume()}
>
	<ol aria-live="polite" aria-relevant="additions">
		{#each toasts.list as t (t.id)}
			<li
				class="toast {t.tone}"
				role={t.tone === 'bad' ? 'alert' : 'status'}
				in:slide={{ dur: 260, y: 14 }}
				out:slide={{ dur: 160, y: 8 }}
				animate:flip={{ duration: 220, easing: cubicOut }}
			>
				<span class="icon" aria-hidden="true">
					{#if t.tone === 'bad'}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.3" /></svg>
					{:else if t.tone === 'ok'}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.3" /></svg>
					{/if}
				</span>
				<span class="text">{t.text}</span>
				{#if t.action}
					<button
						type="button"
						class="action"
						onclick={() => {
							t.action?.run();
							toasts.dismiss(t.id);
						}}>{t.action.label}</button
					>
				{/if}
				<button type="button" class="close" aria-label="Cerrar aviso" onclick={() => toasts.dismiss(t.id)}>
					<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="m2 2 6 6M8 2 2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
				</button>
			</li>
		{/each}
	</ol>
</div>

<style>
	.toaster {
		position: fixed;
		right: 24px;
		bottom: 24px;
		z-index: 60;
		pointer-events: none;
	}

	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 380px;
		min-height: 42px;
		padding: 8px 8px 8px 14px;
		border-radius: var(--r-sm);
		border: 1px solid var(--line-2);
		background: var(--bg-raised);
		box-shadow: 0 16px 40px -16px rgba(0, 0, 0, 0.55);
		font-size: 13px;
		color: var(--ink);
	}

	.icon {
		display: flex;
		color: var(--ink-2);
	}

	.bad {
		border-color: color-mix(in srgb, var(--bad) 40%, var(--line-2));
	}

	.bad .icon {
		color: var(--bad);
	}

	.text {
		flex: 1 1 auto;
	}

	.action {
		flex: 0 0 auto;
		height: 28px;
		padding: 0 10px;
		border: 1px solid color-mix(in srgb, var(--live) 45%, var(--line-2));
		border-radius: 6px;
		background: var(--live-soft);
		color: var(--ink);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			transform 120ms var(--ease-out);
	}

	.action:active {
		transform: scale(0.97);
	}

	@media (hover: hover) and (pointer: fine) {
		.action:hover {
			background: color-mix(in srgb, var(--live) 24%, transparent);
		}
	}

	.close {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink-3);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	@media (hover: hover) and (pointer: fine) {
		.close:hover {
			color: var(--ink);
			background: var(--line);
		}
	}

	@media (max-width: 640px) {
		.toaster {
			left: 16px;
			right: 16px;
			bottom: 16px;
		}
		.toast {
			max-width: none;
			width: 100%;
		}
	}
</style>
