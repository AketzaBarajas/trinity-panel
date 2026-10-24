<script lang="ts">
	import { stats } from '#lib/stats.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import { fmtHM } from '#lib/time.ts';
	import { hourScale, axisLabel, topRounded } from '#lib/charts.ts';
	import ChartTip from './ChartTip.svelte';

	const H = 280;
	const M = { t: 14, r: 4, b: 26, l: 44 };
	const GAP = 2; // separación de superficie entre segmentos

	let width = $state(720);
	let hover = $state<number | null>(null);

	const members = $derived(team.members);
	const cols = $derived(stats.columns);
	// Mínimo del equipo solo cuando cada columna es una semana.
	const people = $derived(team.members.length + team.pending.length);
	const minLine = $derived(stats.range.grain === 'week' ? team.minMinutes * people : null);

	const scale = $derived(hourScale(Math.max(...cols.map((c) => c.total), minLine ?? 0, 60)));
	const iw = $derived(Math.max(width - M.l - M.r, 100));
	const ih = H - M.t - M.b;
	const step = $derived(iw / Math.max(cols.length, 1));
	const barW = $derived(Math.max(3, Math.min(34, step * (cols.length > 40 ? 0.7 : 0.58))));
	const y = (v: number) => M.t + ih - (v / scale.max) * ih;
	const cx = (i: number) => M.l + step * i + step / 2;

	const bars = $derived(
		cols.map((c, i) => {
			const segs: { id: string; d: string; color: string }[] = [];
			let acc = 0;
			const present = members.filter((m) => (c.per.get(m.id) ?? 0) > 0);
			present.forEach((m, k) => {
				const v = c.per.get(m.id) ?? 0;
				const y0 = y(acc);
				const y1 = y(acc + v);
				acc += v;
				const top = k === present.length - 1;
				const h = Math.max(y0 - y1 - (top ? 0 : GAP), 0.8);
				const x = cx(i) - barW / 2;
				segs.push({
					id: m.id,
					color: memberColor(m.color),
					d: top ? topRounded(x, y0 - h, barW, h, 4) : `M${x},${y0 - h}h${barW}v${h}h${-barW}Z`
				});
			});
			return { segs, col: c, i };
		})
	);

	const anyData = $derived(cols.some((c) => c.total > 0));
	const hovered = $derived(hover === null ? null : cols[hover]);

	function onMove(e: PointerEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const i = Math.floor((e.clientX - r.left - M.l) / step);
		hover = i >= 0 && i < cols.length ? i : null;
	}
</script>

<div class="wrap" bind:clientWidth={width}>
	<ul class="legend" aria-label="Leyenda">
		{#each members as m (m.id)}
			<li style:--c={memberColor(m.color)}>
				<span class="dot" aria-hidden="true"></span>
				<span>{m.display_name}</span>
				<span class="num val">{fmtHM(stats.totals.get(m.id) ?? 0)}</span>
			</li>
		{/each}
		{#if minLine}
			<li class="min-key"><span class="dash" aria-hidden="true"></span>Mínimo del equipo · {axisLabel(minLine)}/semana</li>
		{/if}
	</ul>

	<div class="plot">
		<svg
			width={width}
			height={H}
			viewBox="0 0 {width} {H}"
			role="img"
			aria-label="Horas por {stats.range.grain === 'day' ? 'día' : stats.range.grain === 'week' ? 'semana' : 'mes'} y persona, {stats.range.title}"
			onpointermove={onMove}
			onpointerleave={() => (hover = null)}
		>
			<!-- rejilla y eje -->
			{#each scale.ticks as t (t)}
				<line x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} class="grid" class:base={t === 0} />
				<text x={M.l - 10} y={y(t)} class="ylab" dy="0.32em">{axisLabel(t)}</text>
			{/each}

			{#if hovered}
				<rect class="col-hl" x={cx(hover!) - step / 2} y={M.t} width={step} height={ih} />
			{/if}

			{#key stats.range.period + stats.range.from}
				<g class="bars">
					{#each bars as b (b.col.key)}
						<g class:faded={hover !== null && hover !== b.i}>
							{#each b.segs as s (s.id)}
								<path d={s.d} style:fill={s.color} />
							{/each}
						</g>
					{/each}
				</g>
			{/key}

			{#if minLine}
				<line x1={M.l} x2={width - M.r} y1={y(minLine)} y2={y(minLine)} class="min" />
			{/if}

			<!-- eje x -->
			{#each cols as c, i (c.key)}
				{#if c.tick}
					<text x={cx(i)} y={H - 8} class="xlab" class:now={c.current} class:future={c.future}>{c.tick}</text>
				{/if}
				{#if c.current && stats.range.grain !== 'day'}
					<circle cx={cx(i)} cy={H - 20} r="1.6" class="now-dot" />
				{/if}
			{/each}
		</svg>

		{#if !anyData && !stats.loading}
			<p class="empty">Sin horas en este periodo todavía.</p>
		{/if}

		{#if hovered}
			<ChartTip x={cx(hover!)} y={M.t + ih / 2} {width}>
				<span class="t-title">{hovered.label}</span>
				{#each members as m (m.id)}
					<span class="t-row" style:--c={memberColor(m.color)}>
						<span class="t-dot"></span>{m.display_name}<span class="t-val">{fmtHM(hovered.per.get(m.id) ?? 0)}</span>
					</span>
				{/each}
				<span class="t-row t-total">Total<span class="t-val">{fmtHM(hovered.total)}</span></span>
			</ChartTip>
		{/if}
	</div>

	<table class="visually-hidden">
		<caption>Horas por tramo y persona · {stats.range.title}</caption>
		<thead>
			<tr><th scope="col">Tramo</th>{#each members as m (m.id)}<th scope="col">{m.display_name}</th>{/each}<th scope="col">Total</th></tr>
		</thead>
		<tbody>
			{#each cols as c (c.key)}
				<tr>
					<th scope="row">{c.label}</th>
					{#each members as m (m.id)}<td>{fmtHM(c.per.get(m.id) ?? 0)}</td>{/each}
					<td>{fmtHM(c.total)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.wrap {
		position: relative;
		min-width: 0;
	}

	.legend {
		list-style: none;
		margin: 0 0 14px;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
		font-size: 12px;
		color: var(--ink-2);
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--c);
	}

	.val {
		color: var(--ink);
		font-weight: 500;
	}

	.min-key {
		margin-left: auto;
		color: var(--ink-3);
	}

	.dash {
		width: 14px;
		border-top: 1px dashed var(--ink-2);
	}

	.plot {
		position: relative;
	}

	svg {
		display: block;
		overflow: visible;
	}

	.grid {
		stroke: var(--line);
	}

	.grid.base {
		stroke: var(--line-3);
	}

	.ylab,
	.xlab {
		font-size: 11px;
		fill: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}

	.ylab {
		text-anchor: end;
	}

	.xlab {
		text-anchor: middle;
	}

	.xlab.now {
		fill: var(--ink);
		font-weight: 600;
	}

	.xlab.future {
		fill: var(--ink-4);
	}

	.now-dot {
		fill: var(--ink);
	}

	.col-hl {
		fill: var(--line);
	}

	.bars {
		animation: rise 560ms var(--ease-out);
	}

	@keyframes rise {
		from {
			clip-path: inset(100% 0 0 0);
		}
		to {
			clip-path: inset(0 0 0 0);
		}
	}

	.bars g {
		transition: opacity 150ms ease;
	}

	.bars g.faded {
		opacity: 0.45;
	}

	.min {
		stroke: var(--ink-2);
		stroke-dasharray: 4 4;
	}

	.empty {
		position: absolute;
		inset: 0 0 26px 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		color: var(--ink-3);
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.bars {
			animation: none;
		}
	}
</style>
