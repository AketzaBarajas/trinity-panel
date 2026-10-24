<script lang="ts">
	import { stats } from '#lib/stats.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import { fmtHM } from '#lib/time.ts';
	import { pct } from '#lib/charts.ts';

	const SIZE = 184;
	const RO = 88;
	const RI = 64;
	const C = SIZE / 2;

	let active = $state<string | null>(null);

	// Orden fijo (el validado): el color sigue a la especialidad, no al puesto.
	const slices = $derived.by(() => {
		const per = new Map<string, Map<string, number>>();
		for (const r of stats.specs) {
			const m = per.get(r.specialty_slug) ?? new Map<string, number>();
			m.set(r.member_id, (m.get(r.member_id) ?? 0) + r.minutes);
			per.set(r.specialty_slug, m);
		}
		return team.specialties.map((sp) => {
			const by = per.get(sp.slug) ?? new Map<string, number>();
			return { ...sp, by, minutes: [...by.values()].reduce((t, v) => t + v, 0) };
		});
	});

	const total = $derived(slices.reduce((t, s) => t + s.minutes, 0));

	const pt = (r: number, a: number) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
	function arc(a0: number, a1: number): string {
		const span = Math.min(a1 - a0, Math.PI * 2 - 1e-4);
		const e = a0 + span;
		const large = span > Math.PI ? 1 : 0;
		return `M${pt(RO, a0)}A${RO},${RO} 0 ${large} 1 ${pt(RO, e)}L${pt(RI, e)}A${RI},${RI} 0 ${large} 0 ${pt(RI, a0)}Z`;
	}

	const arcs = $derived.by(() => {
		let a = -Math.PI / 2;
		return slices
			.filter((s) => s.minutes > 0)
			.map((s) => {
				const span = (s.minutes / total) * Math.PI * 2;
				const d = arc(a, a + span);
				a += span;
				return { slug: s.slug, color: s.color, d };
			});
	});

	const legend = $derived([...slices].sort((a, b) => b.minutes - a.minutes));
	const focus = $derived(active ? slices.find((s) => s.slug === active) : null);
</script>

<div class="donut">
	<div class="ring">
		<svg width={SIZE} height={SIZE} viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="Reparto del tiempo por especialidad">
			{#if total === 0}
				<circle cx={C} cy={C} r={(RO + RI) / 2} class="empty" stroke-width={RO - RI} />
			{:else}
				{#key stats.range.period + stats.range.from}
					<g class="slices">
						{#each arcs as a (a.slug)}
							<path
								d={a.d}
								style:fill={a.color}
								class:dim={active !== null && active !== a.slug}
								onpointerenter={() => (active = a.slug)}
								onpointerleave={() => (active = null)}
								role="presentation"
							/>
						{/each}
					</g>
				{/key}
			{/if}
		</svg>
		<div class="center">
			{#if focus}
				<span class="c-val num">{fmtHM(focus.minutes)}</span>
				<span class="c-lab">{focus.name}</span>
			{:else}
				<span class="c-val num">{fmtHM(total)}</span>
				<span class="c-lab">{total ? 'con especialidad' : 'sin datos aún'}</span>
			{/if}
		</div>
	</div>

	<ul class="legend">
		{#each legend as s (s.slug)}
			<li
				style:--c={s.color}
				class:dim={active !== null && active !== s.slug}
				class:zero={s.minutes === 0}
				onpointerenter={() => s.minutes && (active = s.slug)}
				onpointerleave={() => (active = null)}
			>
				<span class="dot" aria-hidden="true"></span>
				<span class="name">{s.name}</span>
				<span class="num v">{fmtHM(s.minutes)}</span>
				<span class="num p">{s.minutes ? pct(s.minutes, total) : ''}</span>
				{#if active === s.slug && s.by.size}
					<span class="who">
						{#each team.members.filter((m) => s.by.has(m.id)) as m (m.id)}
							<span style:--mc={memberColor(m.color)}>{m.display_name} {fmtHM(s.by.get(m.id) ?? 0)}</span>
						{/each}
					</span>
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.donut {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
	}

	.ring {
		position: relative;
		width: 184px;
		height: 184px;
	}

	svg {
		display: block;
	}

	path {
		stroke: var(--bg);
		stroke-width: 2;
		stroke-linejoin: round;
		transition: opacity 150ms ease;
	}

	path.dim {
		opacity: 0.3;
	}

	.slices {
		transform-origin: center;
		animation: spin-in 620ms var(--ease-out);
	}

	@keyframes spin-in {
		from {
			opacity: 0;
			transform: rotate(-30deg) scale(0.94);
		}
	}

	.empty {
		fill: none;
		stroke: var(--line-2);
	}

	.center {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		text-align: center;
	}

	.c-val {
		font-size: 20px;
		font-weight: 600;
	}

	.c-lab {
		max-width: 110px;
		font-size: 11px;
		color: var(--ink-3);
	}

	.legend {
		width: 100%;
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.legend li {
		display: grid;
		grid-template-columns: 10px 1fr auto 40px;
		align-items: center;
		column-gap: 9px;
		padding: 6px 0;
		border-top: 1px solid var(--line);
		font-size: 12.5px;
		transition: opacity 150ms ease;
	}

	.legend li.dim {
		opacity: 0.4;
	}

	.legend li.zero {
		color: var(--ink-3);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--c);
	}

	.zero .dot {
		opacity: 0.4;
	}

	.v {
		font-weight: 500;
	}

	.p {
		text-align: right;
		color: var(--ink-3);
		font-size: 11.5px;
	}

	.who {
		grid-column: 2 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 2px 12px;
		margin-top: 3px;
		font-size: 11.5px;
		color: var(--ink-2);
	}

	.who span::before {
		content: '';
		display: inline-block;
		width: 6px;
		height: 6px;
		margin-right: 5px;
		border-radius: 50%;
		background: var(--mc);
	}

	@media (prefers-reduced-motion: reduce) {
		.slices {
			animation: none;
		}
	}
</style>
