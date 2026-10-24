<script lang="ts">
	import { stats, longDate, MONTHS, DOW } from '#lib/stats.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import { fmtHM, addDaysISO } from '#lib/time.ts';
	import ChartTip from './ChartTip.svelte';
	import MemberChips from './MemberChips.svelte';

	let who = $state<string | null>(null);
	let width = $state(800);
	let scroller = $state<HTMLDivElement>();
	let hover = $state<{ day: string; x: number; y: number } | null>(null);

	// Niveles fijos (no relativos): 0 · <30 min · <1 h · <2 h · ≥2 h
	const LEVELS = [0, 30, 60, 120];
	const level = (v: number) => (v <= 0 ? 0 : v < LEVELS[1] ? 1 : v < LEVELS[2] ? 2 : v < LEVELS[3] ? 3 : 4);
	const ALPHA = [0, 30, 52, 76, 100];

	const byDay = $derived.by(() => {
		const out = new Map<string, { total: number; per: Map<string, number> }>();
		for (const r of stats.calendar) {
			if (who && r.member_id !== who) continue;
			const c = out.get(r.day) ?? { total: 0, per: new Map<string, number>() };
			c.total += r.minutes;
			c.per.set(r.member_id, (c.per.get(r.member_id) ?? 0) + r.minutes);
			out.set(r.day, c);
		}
		return out;
	});

	const weeks = $derived.by(() => {
		if (!stats.calFrom) return [];
		const out: { start: string; month: string | null; days: { day: string; future: boolean }[] }[] = [];
		let prevMonth = '';
		for (let w = stats.calFrom; w <= stats.today; w = addDaysISO(w, 7)) {
			const days = Array.from({ length: 7 }, (_, i) => {
				const day = addDaysISO(w, i);
				return { day, future: day > stats.today };
			});
			const m = days[0].day.slice(5, 7);
			out.push({ start: w, month: m !== prevMonth ? MONTHS[+m - 1] : null, days });
			prevMonth = m;
		}
		// No etiquetar el primer mes si es una semana suelta.
		if (out.length > 1 && out[1].month) out[0].month = null;
		return out;
	});

	const summary = $derived.by(() => {
		let worked = 0;
		let best = 0;
		let run = 0;
		const all: string[] = [];
		for (const w of weeks) for (const d of w.days) if (!d.future) all.push(d.day);
		for (const d of all) {
			if ((byDay.get(d)?.total ?? 0) > 0) {
				worked++;
				run++;
				best = Math.max(best, run);
			} else run = 0;
		}
		// Racha actual: si hoy aún no hay horas, cuenta desde ayer.
		let current = 0;
		for (let i = all.length - 1; i >= 0; i--) {
			const has = (byDay.get(all[i])?.total ?? 0) > 0;
			if (has) current++;
			else if (i === all.length - 1) continue;
			else break;
		}
		return { worked, best, current };
	});

	const hue = $derived(who ? memberColor(team.members.find((m) => m.id === who)?.color) : 'var(--ink)');

	$effect(() => {
		// Empieza mostrando lo más reciente si no cabe.
		void weeks.length;
		if (scroller) scroller.scrollLeft = scroller.scrollWidth;
	});

	function enter(e: PointerEvent, day: string) {
		const el = e.currentTarget as HTMLElement;
		const box = (el.closest('.cal') as HTMLElement).getBoundingClientRect();
		const r = el.getBoundingClientRect();
		hover = { day, x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
	}

	const hd = $derived(hover ? byDay.get(hover.day) : undefined);
</script>

<div class="cal" bind:clientWidth={width}>
	<div class="tools">
		<MemberChips bind:value={who} label="Ver constancia de" />
		<p class="sum">
			<span><strong class="num">{summary.worked}</strong> días con horas</span>
			<span>Racha actual <strong class="num">{summary.current}</strong> {summary.current === 1 ? 'día' : 'días'}</span>
			<span>Mejor racha <strong class="num">{summary.best}</strong></span>
		</p>
	</div>

	<div class="scroll" bind:this={scroller}>
		<div class="board" style:--hue={hue} role="img" aria-label="Días trabajados en el último año{who ? `, ${team.members.find((m) => m.id === who)?.display_name}` : ''}: {summary.worked} días con horas">
			<div class="dows" aria-hidden="true">
				{#each DOW as d, i (i)}<span>{i % 2 === 0 ? d : ''}</span>{/each}
			</div>
			{#each weeks as w (w.start)}
				<div class="wk">
					<span class="mo">{w.month ?? ''}</span>
					{#each w.days as d (d.day)}
						{@const v = byDay.get(d.day)?.total ?? 0}
						<span
							class="c l{level(v)}"
							class:future={d.future}
							class:today={d.day === stats.today}
							style:--a="{ALPHA[level(v)]}%"
							onpointerenter={(e) => !d.future && enter(e, d.day)}
							onpointerleave={() => (hover = null)}
							role="presentation"
						></span>
					{/each}
				</div>
			{/each}
		</div>
	</div>

	<div class="scale" aria-hidden="true">
		<span>0</span>
		{#each [1, 2, 3, 4] as l (l)}<span class="c l{l}" style:--hue={hue} style:--a="{ALPHA[l]}%"></span>{/each}
		<span>2 h o más</span>
	</div>

	{#if hover}
		<ChartTip x={hover.x} y={hover.y} {width}>
			<span class="t-title">{longDate(hover.day)}</span>
			{#if !hd || hd.total === 0}
				<span class="t-row">Sin horas</span>
			{:else}
				{#each team.members.filter((m) => hd.per.has(m.id)) as m (m.id)}
					<span class="t-row" style:--c={memberColor(m.color)}><span class="t-dot"></span>{m.display_name}<span class="t-val">{fmtHM(hd.per.get(m.id) ?? 0)}</span></span>
				{/each}
			{/if}
		</ChartTip>
	{/if}
</div>

<style>
	.cal {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
	}

	.sum {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 18px;
		font-size: 12px;
		color: var(--ink-3);
	}

	.sum strong {
		color: var(--ink);
		font-weight: 600;
	}

	.scroll {
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.board {
		display: flex;
		gap: 3px;
		width: max-content;
		margin: 0 auto;
	}

	.dows,
	.wk {
		display: grid;
		grid-template-rows: 14px repeat(7, 12px);
		gap: 3px;
	}

	.dows span {
		font-size: 10px;
		line-height: 12px;
		color: var(--ink-3);
		padding-right: 4px;
	}

	.dows span:first-child {
		margin-top: 17px;
	}

	.dows {
		grid-template-rows: repeat(7, 12px);
		align-content: start;
	}

	.mo {
		font-size: 10.5px;
		color: var(--ink-3);
		white-space: nowrap;
		width: 12px;
		overflow: visible;
	}

	.c {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		background: var(--line);
	}

	.c.l1,
	.c.l2,
	.c.l3,
	.c.l4 {
		background: color-mix(in srgb, var(--hue) var(--a), transparent);
	}

	.c.future {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--line);
	}

	.c.today {
		box-shadow: 0 0 0 1.5px var(--live);
	}

	@media (hover: hover) and (pointer: fine) {
		.wk .c:not(.future):hover {
			box-shadow: 0 0 0 1.5px var(--ink);
		}
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
</style>
