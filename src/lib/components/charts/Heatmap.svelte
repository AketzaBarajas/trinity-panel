<script lang="ts">
	import { stats, DOW, DOW_LONG } from '#lib/stats.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import { fmtHM } from '#lib/time.ts';
	import ChartTip from './ChartTip.svelte';
	import MemberChips from './MemberChips.svelte';

	let who = $state<string | null>(null);
	let width = $state(600);
	let hover = $state<{ d: number; h: number; x: number; y: number } | null>(null);

	const HOURS = Array.from({ length: 24 }, (_, i) => i);

	// cells[d][h] = { total, per }
	const cells = $derived.by(() => {
		const grid = Array.from({ length: 7 }, () =>
			Array.from({ length: 24 }, () => ({ total: 0, per: new Map<string, number>() }))
		);
		for (const r of stats.hourly) {
			if (who && r.member_id !== who) continue;
			const c = grid[r.dow - 1]?.[r.hour];
			if (!c) continue;
			c.total += r.minutes;
			c.per.set(r.member_id, (c.per.get(r.member_id) ?? 0) + r.minutes);
		}
		return grid;
	});

	const max = $derived(Math.max(...cells.flat().map((c) => c.total), 1));
	const hue = $derived(who ? memberColor(team.members.find((m) => m.id === who)?.color) : 'var(--ink)');
	// Raíz cuadrada: las franjas pequeñas siguen viéndose al lado de las grandes.
	const level = (v: number) => (v <= 0 ? 0 : 14 + 86 * Math.sqrt(v / max));

	const peak = $derived.by(() => {
		let best = { d: 0, h: 0, v: 0 };
		cells.forEach((row, d) => row.forEach((c, h) => c.total > best.v && (best = { d, h, v: c.total })));
		return best.v > 0 ? best : null;
	});

	function enter(e: PointerEvent, d: number, h: number) {
		const el = e.currentTarget as HTMLElement;
		const box = el.offsetParent as HTMLElement;
		const r = el.getBoundingClientRect();
		const b = box.getBoundingClientRect();
		hover = { d, h, x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 };
	}

	const hovered = $derived(hover ? cells[hover.d][hover.h] : null);
</script>

<div class="heat">
	<div class="tools">
		<MemberChips bind:value={who} label="Ver franjas de" />
		{#if peak}
			<span class="peak">Pico: <strong>{DOW_LONG[peak.d]} de {peak.h} a {peak.h + 1} h</strong></span>
		{/if}
	</div>

	<div class="box" bind:clientWidth={width} style:--hue={hue}>
		<div class="grid" role="img" aria-label="Minutos trabajados por día de la semana y hora{who ? `, ${team.members.find((m) => m.id === who)?.display_name}` : ', todo el equipo'}">
			{#each cells as row, d (d)}
				<span class="dl">{DOW[d]}</span>
				{#each row as c, h (h)}
					<span
						class="cell"
						class:on={c.total > 0}
						style:--a="{level(c.total)}%"
						onpointerenter={(e) => enter(e, d, h)}
						onpointerleave={() => (hover = null)}
						aria-hidden="true"
					></span>
				{/each}
			{/each}
			<span></span>
			{#each HOURS as h (h)}
				<span class="hl num">{h % 3 === 0 ? h : ''}</span>
			{/each}
		</div>

		{#if hover && hovered}
			<ChartTip x={hover.x} y={hover.y} {width}>
				<span class="t-title">{DOW_LONG[hover.d]} · {hover.h}–{hover.h + 1} h</span>
				{#if hovered.total === 0}
					<span class="t-row">Nadie ha trabajado aquí</span>
				{:else}
					{#each team.members.filter((m) => hovered.per.has(m.id)) as m (m.id)}
						<span class="t-row" style:--c={memberColor(m.color)}>
							<span class="t-dot"></span>{m.display_name}<span class="t-val">{fmtHM(hovered.per.get(m.id) ?? 0)}</span>
						</span>
					{/each}
				{/if}
			</ChartTip>
		{/if}
	</div>

	<div class="scale" aria-hidden="true">
		<span>Menos</span>
		{#each [0, 25, 50, 75, 100] as s (s)}
			<span class="sw" style:--hue={hue} style:--a="{s === 0 ? 0 : 14 + 86 * Math.sqrt(s / 100)}%" class:on={s > 0}></span>
		{/each}
		<span>Más</span>
	</div>

	<table class="visually-hidden">
		<caption>Minutos por día de la semana y hora</caption>
		<tbody>
			{#each cells as row, d (d)}
				{#each row as c, h (h)}
					{#if c.total > 0}
						<tr><th scope="row">{DOW_LONG[d]} {h}–{h + 1} h</th><td>{fmtHM(c.total)}</td></tr>
					{/if}
				{/each}
			{/each}
		</tbody>
	</table>
</div>

<style>
	.heat {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
	}

	.peak {
		font-size: 12px;
		color: var(--ink-3);
	}

	.peak strong {
		font-weight: 500;
		color: var(--ink);
	}

	.box {
		position: relative;
	}

	.grid {
		display: grid;
		grid-template-columns: 18px repeat(24, minmax(0, 1fr));
		gap: 3px;
		align-items: center;
	}

	.dl {
		font-size: 11px;
		color: var(--ink-3);
	}

	.cell {
		aspect-ratio: 1;
		max-height: 26px;
		border-radius: 3px;
		background: var(--line);
		transition:
			background-color 300ms ease,
			box-shadow 120ms ease;
	}

	.cell.on {
		background: color-mix(in srgb, var(--hue) var(--a), transparent);
	}

	@media (hover: hover) and (pointer: fine) {
		.cell:hover {
			box-shadow: 0 0 0 1.5px var(--ink);
		}
	}

	.hl {
		font-size: 10.5px;
		color: var(--ink-3);
		text-align: left;
	}

	.scale {
		display: flex;
		align-items: center;
		gap: 4px;
		align-self: flex-end;
		font-size: 11px;
		color: var(--ink-3);
	}

	.scale span:first-child {
		margin-right: 4px;
	}

	.scale span:last-child {
		margin-left: 4px;
	}

	.sw {
		width: 11px;
		height: 11px;
		border-radius: 3px;
		background: var(--line);
	}

	.sw.on {
		background: color-mix(in srgb, var(--hue) var(--a), transparent);
	}
</style>
