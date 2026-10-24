<script lang="ts">
	import { flip } from 'svelte/animate';
	import { stats } from '#lib/stats.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import { auth } from '#lib/auth.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import { fmtHM, fmtHuman } from '#lib/time.ts';

	type Tab = 'horas' | 'pct';
	let tab = $state<Tab>('horas');

	const expected = $derived(stats.expected);
	const rows = $derived(
		team.members
			.map((m) => {
				const minutes = stats.totals.get(m.id) ?? 0;
				return { ...m, minutes, ratio: expected > 0 ? minutes / expected : 0, c: memberColor(m.color) };
			})
			.sort((a, b) => (tab === 'horas' ? b.minutes - a.minutes : b.ratio - a.ratio))
	);
	const top = $derived(Math.max(...rows.map((r) => r.minutes), 1));
	const CAP = 1.5;

	const note = $derived(
		stats.range.period === 'semana'
			? `Mínimo: ${fmtHuman(team.minMinutes)} por semana.`
			: `Mínimo proporcional: ${fmtHuman(expected)} (${stats.range.elapsedDays} días a ${fmtHuman(team.minMinutes)}/semana).`
	);

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			e.preventDefault();
			tab = tab === 'horas' ? 'pct' : 'horas';
			(e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
		}
	}
</script>

<div class="rank">
	<div class="tabs" role="tablist" aria-label="Ordenar clasificación">
		<span class="ind" class:right={tab === 'pct'} aria-hidden="true"></span>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'horas'}
			tabindex={tab === 'horas' ? 0 : -1}
			onclick={() => (tab = 'horas')}
			onkeydown={onKey}>Horas</button
		>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'pct'}
			tabindex={tab === 'pct' ? 0 : -1}
			onclick={() => (tab = 'pct')}
			onkeydown={onKey}>% del mínimo</button
		>
	</div>

	<div role="tabpanel">
	<ol class="list">
		{#each rows as r, i (r.id)}
			{@const ok = r.ratio >= 1}
			<li style:--c={r.c} animate:flip={{ duration: 260 }}>
				<span class="pos num">{i + 1}</span>
				<span class="grow">
					<span class="top">
						<span class="name">{r.display_name}{r.id === auth.member?.id ? ' (tú)' : ''}</span>
						<span class="num v">{tab === 'horas' ? fmtHM(r.minutes) : `${Math.round(r.ratio * 100)} %`}</span>
					</span>
					<span class="bar" aria-hidden="true">
						{#if tab === 'horas'}
							<span class="fill" style:transform="scaleX({r.minutes / top})"></span>
						{:else}
							<span class="fill" style:transform="scaleX({Math.min(r.ratio, CAP) / CAP})"></span>
							<i style:left="{(1 / CAP) * 100}%"></i>
						{/if}
					</span>
					<span class="sub">
						{#if ok}
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
							Cumple{r.minutes > expected ? ` · +${fmtHuman(r.minutes - expected)} extra` : ''}
						{:else}
							Le faltan {fmtHuman(expected - r.minutes)}
						{/if}
					</span>
				</span>
			</li>
		{/each}
		{#each team.pending as p (p.discord_id)}
			<li class="pending">
				<span class="pos num">–</span>
				<span class="grow"><span class="top"><span class="name">{p.display_name}</span><span class="sub">Aún no ha entrado</span></span></span>
			</li>
		{/each}
	</ol>
	</div>

	<p class="note">{note}</p>
</div>

<style>
	.rank {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.tabs {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr;
		padding: 3px;
		border-radius: var(--r-sm);
		background: var(--bg-sunken);
		box-shadow: inset 0 0 0 1px var(--line);
	}

	.tabs button {
		position: relative;
		z-index: 1;
		height: 28px;
		border: 0;
		background: transparent;
		color: var(--ink-3);
		font-size: 12.5px;
		cursor: pointer;
		transition: color 150ms ease;
	}

	.tabs button[aria-selected='true'] {
		color: var(--ink);
		font-weight: 500;
	}

	.ind {
		position: absolute;
		top: 3px;
		bottom: 3px;
		left: 3px;
		width: calc(50% - 3px);
		border-radius: 6px;
		background: var(--bg-raised);
		box-shadow:
			0 0 0 1px var(--line-2),
			0 2px 6px -2px rgba(0, 0, 0, 0.4);
		transition: transform 240ms var(--ease-out);
	}

	.ind.right {
		transform: translateX(100%);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	li {
		display: flex;
		gap: 10px;
		font-size: 13px;
	}

	.pos {
		width: 14px;
		padding-top: 1px;
		font-size: 12px;
		color: var(--ink-3);
	}

	.grow {
		flex: 1 1 auto;
		min-width: 0;
	}

	.top {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}

	.name {
		font-weight: 500;
	}

	.v {
		font-weight: 500;
	}

	.bar {
		position: relative;
		display: block;
		height: 4px;
		margin: 7px 0 5px;
		border-radius: 4px;
		background: var(--line-2);
	}

	.fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--c);
		transform-origin: left center;
		transition: transform 500ms var(--ease-out);
	}

	.bar i {
		position: absolute;
		top: -4px;
		width: 1px;
		height: 12px;
		background: var(--ink-2);
	}

	.sub {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		color: var(--ink-3);
	}

	.pending {
		color: var(--ink-3);
	}

	.note {
		font-size: 12px;
		color: var(--ink-3);
		padding-top: 12px;
		border-top: 1px solid var(--line);
	}
</style>
