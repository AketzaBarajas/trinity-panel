<script lang="ts">
	import { untrack } from 'svelte';
	import { stats, PERIODS, type PeriodKey } from '#lib/stats.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import StackedBars from './charts/StackedBars.svelte';
	import Ranking from './charts/Ranking.svelte';
	import Heatmap from './charts/Heatmap.svelte';
	import SpecialtyDonut from './charts/SpecialtyDonut.svelte';
	import DayTimeline from './charts/DayTimeline.svelte';
	import YearCalendar from './charts/YearCalendar.svelte';

	// Recarga cuando llega cualquier cambio del equipo (realtime o algo tuyo).
	$effect(() => {
		void team.revision;
		untrack(() => void stats.refresh());
	});

	const idx = $derived(PERIODS.findIndex((p) => p.key === stats.period));

	function onKey(e: KeyboardEvent) {
		const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!d) return;
		e.preventDefault();
		const next = PERIODS[(idx + d + PERIODS.length) % PERIODS.length].key;
		pick(next);
		const group = (e.currentTarget as HTMLElement).parentElement;
		queueMicrotask(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
	}

	function pick(p: PeriodKey) {
		stats.setPeriod(p);
	}

	const grainWord = $derived(stats.range.grain === 'day' ? 'día' : stats.range.grain === 'week' ? 'semana' : 'mes');
</script>

<section class="analysis" aria-labelledby="analisis" aria-busy={stats.loading}>
	<header class="bar">
		<div>
			<h2 id="analisis">Análisis</h2>
			<p class="muted cap">{stats.range.title}</p>
		</div>
		<div class="seg" role="radiogroup" aria-label="Periodo" style:--i={idx} style:--n={PERIODS.length}>
			<span class="ind" aria-hidden="true"></span>
			{#each PERIODS as p (p.key)}
				<button
					type="button"
					role="radio"
					aria-checked={stats.period === p.key}
					tabindex={stats.period === p.key ? 0 : -1}
					onclick={() => pick(p.key)}
					onkeydown={onKey}>{p.label}</button
				>
			{/each}
		</div>
	</header>

	{#if stats.error}
		<div class="alert" role="alert">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.3" /></svg>
			<span>No se han podido cargar las estadísticas. ¿Has ejecutado la migración de la Fase 4 en Supabase?</span>
		</div>
	{/if}

	<div class="grid" class:loading={stats.loading}>
		<div class="cell wide">
			<h3>Horas por {grainWord}</h3>
			<StackedBars />
		</div>
		<div class="cell side">
			<h3>Clasificación</h3>
			<Ranking />
		</div>

		<div class="cell wide">
			<h3>¿Cuándo se trabaja?</h3>
			<Heatmap />
		</div>
		<div class="cell side">
			<h3>¿En qué se va el tiempo?</h3>
			<SpecialtyDonut />
		</div>

		<div class="cell full">
			<h3>Línea del día</h3>
			<DayTimeline />
		</div>

		<div class="cell full">
			<h3>Constancia <span class="muted">· último año</span></h3>
			<YearCalendar />
		</div>
	</div>
</section>

<style>
	.analysis {
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding-top: 30px;
		border-top: 1px solid var(--line);
	}

	.bar {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}

	h2 {
		font-size: 24px;
		font-weight: 300;
		font-style: italic;
		letter-spacing: -0.02em;
	}

	.cap {
		margin-top: 2px;
		font-size: 13px;
	}

	.cap::first-letter {
		text-transform: uppercase;
	}

	/* ─── Selector de periodo ─── */
	.seg {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--n), 1fr);
		padding: 3px;
		border-radius: 999px;
		border: 1px solid var(--line-2);
		background: var(--bg-raised);
	}

	.seg button {
		position: relative;
		z-index: 1;
		height: 30px;
		padding: 0 16px;
		border: 0;
		background: transparent;
		color: var(--ink-3);
		font-size: 13px;
		cursor: pointer;
		transition: color 160ms ease;
	}

	.seg button[aria-checked='true'] {
		color: var(--bg);
		font-weight: 600;
	}

	@media (hover: hover) and (pointer: fine) {
		.seg button:not([aria-checked='true']):hover {
			color: var(--ink);
		}
	}

	.ind {
		position: absolute;
		top: 3px;
		bottom: 3px;
		left: 3px;
		width: calc((100% - 6px) / var(--n));
		border-radius: 999px;
		background: var(--ink);
		transform: translateX(calc(100% * var(--i)));
		transition: transform 260ms var(--ease-out);
	}

	/* ─── Rejilla de gráficas (líneas, no tarjetas) ─── */
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
		column-gap: 44px;
		transition: opacity 200ms ease;
	}

	.grid.loading {
		opacity: 0.55;
	}

	.cell {
		min-width: 0;
		padding: 22px 0 28px;
		border-top: 1px solid var(--line);
	}

	.cell:nth-child(-n + 2) {
		border-top: 0;
		padding-top: 0;
	}

	.full {
		grid-column: 1 / -1;
	}

	h3 {
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 16px;
	}

	h3 .muted {
		font-weight: 400;
	}

	@media (max-width: 1000px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.cell:nth-child(2) {
			border-top: 1px solid var(--line);
			padding-top: 22px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ind {
			transition: none;
		}
	}
</style>
