<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Share {
		color: string;
		weight: number;
	}

	let {
		size = 240,
		shares = [],
		live = false,
		children
	}: { size?: number; shares?: Share[]; live?: boolean; children?: Snippet } = $props();

	// Espiral de partículas (ángulo áureo). Si hay horas, cada miembro tiñe una
	// parte proporcional de las partículas; si no, quedan en gris tenue.
	const N = 210;
	const GOLDEN = Math.PI * (3 - Math.sqrt(5));

	const particles = $derived.by(() => {
		const c = size / 2;
		const rOut = c * 0.74;
		const rIn = c * 0.38;
		const total = shares.reduce((t, s) => t + s.weight, 0);
		const cuts: { color: string; until: number }[] = [];
		let acc = 0;
		for (const s of shares) {
			if (s.weight <= 0) continue;
			acc += s.weight / total;
			cuts.push({ color: s.color, until: acc });
		}
		return Array.from({ length: N }, (_, k) => {
			const t = (k + 0.5) / N;
			const r = rIn + (rOut - rIn) * Math.sqrt(t);
			const a = k * GOLDEN;
			// orden pseudoaleatorio estable para mezclar colores en la espiral
			const mix = ((k * 7919) % N) / N;
			const color = cuts.length ? (cuts.find((x) => mix <= x.until) ?? cuts[cuts.length - 1]).color : null;
			return {
				x: c + Math.cos(a) * r,
				y: c + Math.sin(a) * r,
				r: 0.7 + (1 - t) * 0.9 + ((k * 13) % 5) * 0.12,
				color,
				o: 0.25 + ((k * 31) % 10) / 14
			};
		});
	});

	const ticks = $derived.by(() => {
		const c = size / 2;
		return Array.from({ length: 72 }, (_, i) => {
			const a = (i / 72) * Math.PI * 2;
			const long = i % 6 === 0;
			const r1 = c - 2;
			const r0 = c - (long ? 9 : 5);
			return { x1: c + Math.cos(a) * r0, y1: c + Math.sin(a) * r0, x2: c + Math.cos(a) * r1, y2: c + Math.sin(a) * r1, long };
		});
	});
</script>

<div class="orb" class:live style:--size="{size}px">
	<svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
		<circle cx={size / 2} cy={size / 2} r={size / 2 - 1} class="ring" />
		<g class="ticks">
			{#each ticks as t, i (i)}
				<line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} class:long={t.long} />
			{/each}
		</g>
		<circle cx={size / 2} cy={size / 2} r={size * 0.39} class="dash" />
		<g class="spin">
			{#each particles as p, i (i)}
				<circle
					cx={p.x}
					cy={p.y}
					r={p.r}
					style:fill={p.color ?? 'var(--ink-3)'}
					style:fill-opacity={p.color ? p.o : p.o * 0.5}
				/>
			{/each}
		</g>
	</svg>
	<div class="core">
		{@render children?.()}
	</div>
</div>

<style>
	.orb {
		position: relative;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		background: var(--orb-core);
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	.ring {
		fill: none;
		stroke: var(--line-2);
	}

	.ticks line {
		stroke: var(--line-2);
		stroke-width: 1;
	}

	.ticks line.long {
		stroke: var(--line-3);
	}

	.dash {
		fill: none;
		stroke: var(--line-2);
		stroke-dasharray: 1 5;
	}

	.spin {
		transform-origin: 50% 50%;
		transform-box: view-box;
		animation: spin 160s linear infinite;
	}

	.live .spin {
		animation-duration: 60s;
	}

	.live .ring {
		stroke: var(--live);
		stroke-opacity: 0.5;
	}

	.core {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		text-align: center;
		pointer-events: none;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spin {
			animation: none;
		}
	}
</style>
