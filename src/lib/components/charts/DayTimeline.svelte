<script lang="ts">
	import { team } from '#lib/team.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import { fmtHM, hhmm, longDay } from '#lib/time.ts';
	import ChartTip from './ChartTip.svelte';

	const TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

	const todayIdx = $derived(
		Math.max(0, team.week.days.findIndex((d, i) => team.now >= d.getTime() && team.now < (team.week.days[i + 1] ?? team.week.end).getTime()))
	);
	let pick = $state<number | null>(null);
	const idx = $derived(pick ?? todayIdx);
	const isToday = $derived(idx === todayIdx);

	const lo = $derived(team.week.days[idx].getTime());
	const hi = $derived((team.week.days[idx + 1] ?? team.week.end).getTime());
	const len = $derived(hi - lo);
	const pos = (t: number) => ((Math.min(Math.max(t, lo), hi) - lo) / len) * 100;

	const rows = $derived(
		team.members.map((m) => ({
			m,
			c: memberColor(m.color),
			blocks: team.sessions
				.filter((s) => s.member_id === m.id)
				.map((s) => {
					const a = Date.parse(s.started_at);
					const b = s.ended_at ? Date.parse(s.ended_at) : team.now;
					return { s, a, b, live: !s.ended_at };
				})
				.filter((x) => x.b > lo && x.a < hi)
		}))
	);

	const dayTotal = $derived(rows.reduce((t, r) => t + r.blocks.reduce((u, x) => u + (Math.min(x.b, hi) - Math.max(x.a, lo)) / 60000, 0), 0));

	let width = $state(800);
	let tip = $state<{ x: number; y: number; title: string; who: string; c: string; range: string; dur: string } | null>(null);

	function enter(e: PointerEvent, r: (typeof rows)[number], x: (typeof rows)[number]['blocks'][number]) {
		const el = e.currentTarget as HTMLElement;
		const box = (el.closest('.tl') as HTMLElement).getBoundingClientRect();
		const b = el.getBoundingClientRect();
		tip = {
			x: Math.min(e.clientX, b.right) - box.left,
			y: b.top - box.top + b.height / 2,
			title: x.s.title ?? (x.live ? 'En marcha' : 'Sin describir'),
			who: r.m.display_name,
			c: r.c,
			range: `${hhmm(new Date(x.a))} – ${x.live ? 'ahora' : hhmm(new Date(x.b))}`,
			dur: fmtHM((x.b - x.a) / 60000)
		};
	}
</script>

<div class="tl" bind:clientWidth={width}>
	<div class="head">
		<div class="nav">
			<button type="button" class="nb" aria-label="Día anterior" disabled={idx === 0} onclick={() => (pick = idx - 1)}>
				<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
			<span class="day" aria-live="polite">{isToday ? 'Hoy · ' : ''}{longDay(team.week.days[idx])}</span>
			<button type="button" class="nb" aria-label="Día siguiente" disabled={idx >= todayIdx} onclick={() => (pick = idx + 1 === todayIdx ? null : idx + 1)}>
				<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
		</div>
		<span class="sum">Equipo: <strong class="num">{fmtHM(dayTotal)}</strong></span>
	</div>

	<div class="rows">
		{#each rows as r (r.m.id)}
			<div class="row" style:--c={r.c}>
				<span class="who"><span class="dot" aria-hidden="true"></span>{r.m.display_name}</span>
				<div class="track">
					{#each TICKS.slice(1, -1) as t (t)}<i style:left="{(t / 24) * 100}%"></i>{/each}
					{#each r.blocks as x (x.s.id)}
						<span
							class="blk"
							class:live={x.live}
							class:manual={x.s.is_manual}
							style:left="{pos(x.a)}%"
							style:width="max(3px, {pos(x.b) - pos(x.a)}%)"
							onpointerenter={(e) => enter(e, r, x)}
							onpointerleave={() => (tip = null)}
							role="presentation"
						></span>
					{/each}
				</div>
			</div>
		{/each}

		<div class="row axis" aria-hidden="true">
			<span></span>
			<div class="ticks">
				{#each TICKS as t (t)}<span class="num" style:left="{(t / 24) * 100}%">{t}</span>{/each}
			</div>
		</div>

		{#if isToday && team.now >= lo && team.now < hi}
			<div class="now-wrap" aria-hidden="true">
				<span class="now" style:left="{pos(team.now)}%"></span>
			</div>
		{/if}
	</div>

	{#if tip}
		<ChartTip x={tip.x} y={tip.y} {width}>
			<span class="t-title">{tip.title}</span>
			<span class="t-row" style:--c={tip.c}><span class="t-dot"></span>{tip.who}<span class="t-val">{tip.dur}</span></span>
			<span class="t-row">{tip.range}</span>
		</ChartTip>
	{/if}

	<table class="visually-hidden">
		<caption>Sesiones del {longDay(team.week.days[idx])}</caption>
		<tbody>
			{#each rows as r (r.m.id)}
				{#each r.blocks as x (x.s.id)}
					<tr><th scope="row">{r.m.display_name}</th><td>{hhmm(new Date(x.a))} – {x.live ? 'ahora' : hhmm(new Date(x.b))}</td><td>{x.s.title ?? ''}</td></tr>
				{/each}
			{/each}
		</tbody>
	</table>
</div>

<style>
	.tl {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.nav {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.nb {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		border: 1px solid var(--line-2);
		background: var(--bg-raised);
		color: var(--ink-2);
		cursor: pointer;
		transition:
			transform 120ms var(--ease-out),
			color 150ms ease;
	}

	.nb:active:not(:disabled) {
		transform: scale(0.94);
	}

	.nb:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.day {
		min-width: 170px;
		text-align: center;
		font-size: 13px;
		font-weight: 500;
	}

	.sum {
		font-size: 12px;
		color: var(--ink-3);
	}

	.sum strong {
		color: var(--ink);
		font-weight: 600;
	}

	.rows {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.row {
		display: grid;
		grid-template-columns: 96px minmax(0, 1fr);
		align-items: center;
		gap: 12px;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12.5px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dot {
		width: 7px;
		height: 7px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--c);
	}

	.track {
		position: relative;
		height: 22px;
		border-radius: 4px;
		background: var(--bg-sunken);
		box-shadow: inset 0 0 0 1px var(--line);
	}

	.track i {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--line);
	}

	.blk {
		position: absolute;
		top: 4px;
		bottom: 4px;
		border-radius: 3px;
		background: var(--c);
		transition: filter 150ms ease;
	}

	.blk.manual {
		background: repeating-linear-gradient(135deg, var(--c) 0 3px, color-mix(in srgb, var(--c) 55%, transparent) 3px 6px);
	}

	.blk.live {
		box-shadow: 0 0 10px color-mix(in srgb, var(--c) 60%, transparent);
	}

	.blk.live::after {
		content: '';
		position: absolute;
		right: -1px;
		top: -2px;
		bottom: -2px;
		width: 2px;
		border-radius: 2px;
		background: var(--ink);
		animation: blink 1.6s ease-in-out infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0.25;
		}
	}

	@media (hover: hover) and (pointer: fine) {
		.blk:hover {
			filter: brightness(1.2);
		}
	}

	.axis .ticks {
		position: relative;
		height: 14px;
	}

	.ticks span {
		position: absolute;
		transform: translateX(-50%);
		font-size: 10.5px;
		color: var(--ink-3);
	}

	.ticks span:first-child {
		transform: none;
	}

	.ticks span:last-child {
		transform: translateX(-100%);
	}

	.now-wrap {
		position: absolute;
		top: -4px;
		bottom: 18px;
		left: 108px;
		right: 0;
		pointer-events: none;
	}

	.now {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--live);
		box-shadow: 0 0 6px var(--live-glow);
	}

	.now::before {
		content: '';
		position: absolute;
		top: -3px;
		left: -3px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--live);
	}

	@media (prefers-reduced-motion: reduce) {
		.blk.live::after {
			animation: none;
		}
	}
</style>
