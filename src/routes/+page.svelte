<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import { stopwatch } from '#lib/stopwatch.svelte.ts';
	import { pact, STATUS } from '#lib/pact.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import { greeting, longDay, weekRange, fmtHM, fmtHuman, fmtClock, relDay } from '#lib/time.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import FlowStage from '#lib/components/FlowStage.svelte';
	import Sparkline from '#lib/components/Sparkline.svelte';

	onMount(() => team.use());

	// Las gráficas se descargan solo cuando se van a ver (la portada abre al instante).
	let anchor = $state<HTMLElement>();
	let analysis = $state<Promise<typeof import('#lib/components/Analysis.svelte')> | null>(null);
	onMount(() => {
		if (!anchor) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					analysis = import('#lib/components/Analysis.svelte');
					io.disconnect();
				}
			},
			{ rootMargin: '400px' }
		);
		io.observe(anchor);
		return () => io.disconnect();
	});

	const now = new Date();
	const me = $derived(auth.member!);

	const ranking = $derived(
		team.members
			.map((m) => ({ ...m, minutes: team.minutesBy(m.id), c: memberColor(m.color) }))
			.sort((a, b) => b.minutes - a.minutes)
	);

	const mine = $derived(team.minutesBy(me.id));
	// Lo que te pide el pacto esta semana: mínimo (menos ausencias) + lo que recuperas.
	const cur = $derived(pact.current(me.id));
	const min = $derived(pact.goalOf(me.id));
	const own = $derived(me.weekly_goal_minutes ?? 0);
	const scale = $derived(Math.max(min * 1.5, own * 1.15, mine, 60));
	const strikes = $derived(pact.strikes(me.id));
	const prev = $derived(pact.previous(me.id));

	const notes = $derived.by(() => {
		const out: { text: string; tone: 'warn' | 'bad' | 'soft' }[] = [];
		if (!cur) return out;
		if (cur.absent === 7) out.push({ text: 'Semana justificada: esta semana no tienes mínimo.', tone: 'soft' });
		else if (cur.absent) out.push({ text: `${cur.absent} ${cur.absent === 1 ? 'día justificado' : 'días justificados'}: tu mínimo baja a ${fmtHuman(cur.target)}.`, tone: 'soft' });
		if (cur.carry) {
			out.push({
				text: `Recuperas ${fmtHuman(cur.carry)} de la semana pasada. Si no llegas a ${fmtHuman(min)}, será ${strikes ? 'penalización' : 'tu primer toque de atención'}.`,
				tone: 'warn'
			});
		}
		if (prev && (prev.status === 'toque' || prev.status === 'penalizacion')) {
			out.push({ text: `La semana pasada se cerró con ${STATUS[prev.status].label.toLowerCase()}.`, tone: prev.status === 'toque' ? 'warn' : 'bad' });
		}
		if (cur.review >= 1) out.push({ text: `${fmtHuman(cur.review)} esperan validación de otro admin (cuentan mientras tanto).`, tone: 'soft' });
		return out;
	});

	// Pique sano: frases con números exactos.
	const rivalry = $derived.by(() => {
		const others = ranking.filter((r) => r.id !== me.id);
		const pos = ranking.findIndex((r) => r.id === me.id);
		if (!ranking.some((r) => r.minutes > 0)) return 'Nadie ha fichado aún esta semana. El primero marca el ritmo.';
		if (pos === 0) {
			const second = others[0];
			if (!second) return 'Vas primero.';
			const gap = mine - second.minutes;
			return gap < 1 ? `Empatas con ${second.display_name}.` : `Vas primero: le sacas ${fmtHuman(gap)} a ${second.display_name}.`;
		}
		const leader = ranking[0];
		return `${leader.display_name} te saca ${fmtHuman(leader.minutes - mine)}.`;
	});

	const pactLine = $derived.by(() => {
		if (cur?.absent === 7) return 'Lo que sumes esta semana es extra.';
		if (mine < min) return `Te faltan ${fmtHuman(min - mine)} para cumplir.`;
		if (own > min && mine < own) return `Cumplido. Para tu objetivo de ${fmtHuman(own)} te faltan ${fmtHuman(own - mine)}.`;
		return 'Cumplido. Lo que sumes ahora es extra.';
	});

	const live = $derived(
		team.running().map((s) => {
			const m = team.members.find((x) => x.id === s.member_id);
			return {
				id: s.id,
				name: m?.display_name ?? '—',
				c: memberColor(m?.color),
				secs: (team.now - new Date(s.started_at).getTime()) / 1000
			};
		})
	);

	const closed = $derived(team.sessions.filter((s) => s.ended_at));
	const avg = $derived(closed.length ? closed.reduce((t, s) => t + team.minutesOf(s), 0) / closed.length : 0);
	const meeting = $derived(ranking.filter((r) => r.minutes >= pact.goalOf(r.id) - 0.5));
</script>

<svelte:head>
	<title>Panel · trinity-panel</title>
</svelte:head>

<AppHeader />

<main class="page">
	<div class="hello">
		<h1>{greeting(now)}, {me.display_name}</h1>
		<p class="muted">{longDay(now)} · semana {team.week.number}, {weekRange(team.week)}</p>
	</div>

	<div class="console">
		<div class="stage-wrap">
			<FlowStage meId={me.id} />
		</div>

		<aside class="slab" aria-labelledby="tu-semana">
			<div class="slab-head">
				<h2 id="tu-semana">Tu semana</h2>
				<span class="muted">{cur?.carry ? 'objetivo' : 'mínimo'} {fmtHuman(min)}</span>
			</div>

			<div class="mine">
				<span class="mine-value num">{fmtHM(mine)}</span>
				<div class="track" role="img" aria-label="{min ? Math.round((mine / min) * 100) : 100} % del mínimo{own ? `, objetivo personal ${fmtHuman(own)}` : ''}" style:--c={memberColor(me.color)}>
					<span class="fill" style:transform="scaleX({Math.min(mine / scale, 1)})"></span>
					{#if min}<span class="goal" style:left="{(min / scale) * 100}%"></span>{/if}
					{#if own && own !== min}<span class="goal own" style:left="{(own / scale) * 100}%" title="Tu objetivo personal"></span>{/if}
				</div>
				<p class="line">{pactLine}</p>
				<p class="line strong">{rivalry}</p>
			</div>

			{#if notes.length || strikes}
				<div class="block pact">
					<div class="block-head">
						<h3>Pacto</h3>
						<a class="see" href="/pacto">Ver el pacto →</a>
					</div>
					<ul class="notes">
						{#each notes as n (n.text)}
							<li class={n.tone}>{n.text}</li>
						{/each}
						{#if strikes}
							<li class={strikes > 1 ? 'bad' : 'warn'}>
								Llevas {strikes === 1 ? '1 incumplimiento (toque de atención)' : `${strikes} incumplimientos: el próximo también es penalización`}.
							</li>
						{/if}
					</ul>
				</div>
			{/if}

			<div class="block">
				<h3>Ahora mismo</h3>
				{#if live.length}
					<ul class="list">
						{#each live as l (l.id)}
							<li>
								<span class="dot pulse" style:--c={l.c}></span>
								<span class="grow">{l.name} está fichado</span>
								<span class="mono">{fmtClock(l.secs)}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted">Nadie está fichado.</p>
				{/if}
			</div>

			<div class="block">
				<div class="block-head">
					<h3>Últimas actividades</h3>
					<a class="see" href="/sesiones">Ver todas →</a>
				</div>
				{#if team.recent.length}
					<ul class="recent">
						{#each team.recent as s (s.id)}
							{@const m = team.members.find((x) => x.id === s.member_id)}
							<li style:--c={memberColor(m?.color)}>
								<span class="dot" aria-hidden="true"></span>
								<span class="grow">
									<span class="r-title">{s.title}</span>
									<span class="r-meta">{m?.display_name ?? '—'} · {fmtHM(team.durationOf(s))} · {relDay(new Date(s.started_at), new Date(team.now))}{s.is_manual ? ' · manual' : ''}</span>
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted">Aún no hay actividades. Para el cronómetro y cuenta qué has hecho.</p>
				{/if}
			</div>

			<div class="block manual">
				<span class="muted">¿Se te olvidó darle al play?</span>
				<button type="button" class="link" onclick={() => stopwatch.openManual()}>Añadir horas a mano</button>
			</div>
		</aside>
	</div>

	<section class="metrics" aria-label="Métricas de la semana">
		<div class="metric">
			<span class="m-label">Horas del equipo</span>
			<div class="m-row">
				<span class="m-value num">{fmtHM(team.totalMinutes)}</span>
				<Sparkline values={team.perDay()} label="Horas del equipo por día, lunes a domingo" />
			</div>
			<span class="m-sub">Lunes a domingo</span>
		</div>
		<div class="metric">
			<span class="m-label">Sesiones</span>
			<div class="m-row">
				<span class="m-value num">{team.sessions.length}</span>
				<Sparkline values={team.countPerDay()} color="var(--m-3A70F0)" label="Sesiones por día" />
			</div>
			<span class="m-sub">{live.length ? `${live.length} en marcha ahora` : 'Ninguna en marcha'}</span>
		</div>
		<div class="metric">
			<span class="m-label">Media por sesión</span>
			<div class="m-row">
				<span class="m-value num">{fmtHM(avg)}</span>
			</div>
			<span class="m-sub">Corte automático a las {team.autoCutMinutes / 60} h</span>
		</div>
		<div class="metric">
			<span class="m-label">Cumplen el mínimo</span>
			<div class="m-row">
				<span class="m-value num">{meeting.length} / {team.members.length + team.pending.length}</span>
				<span class="pips" aria-hidden="true">
					{#each ranking as r (r.id)}
						<span class:on={r.minutes >= pact.goalOf(r.id) - 0.5} style:--c={r.c}></span>
					{/each}
					{#each team.pending as p (p.discord_id)}
						<span class="ghost"></span>
					{/each}
				</span>
			</div>
			<span class="m-sub">{meeting.length ? meeting.map((m) => m.display_name).join(' y ') : 'Nadie todavía'}</span>
		</div>
	</section>

	<div class="analysis-slot" bind:this={anchor}>
		{#if analysis}
			{#await analysis then mod}
				<mod.default />
			{/await}
		{/if}
	</div>
</main>

<style>
	.page {
		max-width: 1440px;
		margin: 0 auto;
		padding: 28px 28px 40px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.hello {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px 24px;
	}

	h1 {
		font-size: 30px;
		font-weight: 300;
		font-style: italic;
		letter-spacing: -0.025em;
	}

	.console {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
		gap: 24px;
		align-items: center;
	}

	.stage-wrap {
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
	}


	/* ─── Panel de cristal (el único) ─── */
	.slab {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding: 22px;
		border-radius: var(--r-lg);
		border: 1px solid var(--line-2);
		background: var(--slab);
		backdrop-filter: blur(18px) saturate(1.2);
		-webkit-backdrop-filter: blur(18px) saturate(1.2);
		box-shadow:
			inset 0 1px 0 var(--slab-edge),
			0 24px 60px -20px rgba(0, 0, 0, 0.5);
	}

	.slab-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	h2 {
		font-size: 15px;
	}

	h3 {
		font-size: 12px;
		font-weight: 600;
		color: var(--ink-2);
		margin-bottom: 10px;
	}

	.mine {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.mine-value {
		font-size: 44px;
		font-weight: 500;
		line-height: 1;
		letter-spacing: -0.04em;
	}

	.track {
		position: relative;
		height: 4px;
		border-radius: 4px;
		background: var(--line-2);
		margin: 6px 0 4px;
	}

	.fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--c);
		transform-origin: left center;
		transition: transform 600ms var(--ease-out);
	}

	.goal {
		position: absolute;
		top: -4px;
		width: 1px;
		height: 12px;
		background: var(--ink-2);
	}

	.goal.own {
		top: -2px;
		height: 8px;
		background: none;
		border-left: 1px dashed var(--ink-3);
	}

	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 12.5px;
		color: var(--ink-2);
	}

	.notes li {
		display: flex;
		gap: 9px;
		text-wrap: pretty;
	}

	.notes li::before {
		content: '';
		flex: 0 0 auto;
		width: 6px;
		height: 6px;
		margin-top: 6px;
		border-radius: 50%;
		background: var(--ink-3);
	}

	.notes li.warn::before {
		background: var(--warn);
	}

	.notes li.bad {
		color: var(--ink);
	}

	.notes li.bad::before {
		background: var(--bad);
	}

	.line {
		font-size: 13px;
		color: var(--ink-2);
	}

	.line.strong {
		color: var(--ink);
		font-weight: 500;
	}

	.block {
		padding-top: 18px;
		border-top: 1px solid var(--line);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.list li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
	}

	.grow {
		flex: 1 1 auto;
		min-width: 0;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
	}

	.pulse {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 30%, transparent);
	}








	/* ─── Métricas ─── */
	.metrics {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		border-top: 1px solid var(--line);
		padding-top: 18px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 2px 24px;
		border-left: 1px solid var(--line);
	}

	.metric:first-child {
		border-left: 0;
		padding-left: 0;
	}

	.m-label {
		font-size: 12px;
		color: var(--ink-2);
	}

	.m-row {
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: 34px;
	}

	.m-value {
		font-size: 24px;
		font-weight: 500;
		letter-spacing: -0.03em;
	}

	.m-sub {
		font-size: 12px;
		color: var(--ink-3);
	}

	.pips {
		display: flex;
		gap: 5px;
	}

	.pips span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1px solid var(--c);
	}

	.pips span.on {
		background: var(--c);
	}

	.pips span.ghost {
		border: 1px dashed var(--ink-4);
	}

	.analysis-slot {
		min-height: 600px;
		margin-top: 12px;
	}

	.block-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	.see {
		font-size: 12px;
		color: var(--ink-3);
		text-decoration: none;
		transition: color 150ms ease;
	}

	@media (hover: hover) and (pointer: fine) {
		.see:hover {
			color: var(--ink);
		}
	}

	.recent {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 11px;
	}

	.recent li {
		display: flex;
		gap: 10px;
		font-size: 13px;
	}

	.recent .dot {
		margin-top: 6px;
		flex: 0 0 auto;
	}

	.r-title {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.r-meta {
		display: block;
		font-size: 12px;
		color: var(--ink-3);
	}

	.manual {
		margin-top: auto;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 8px;
		font-size: 12.5px;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font-size: 12.5px;
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--line-3);
		text-underline-offset: 3px;
		cursor: pointer;
		transition: text-decoration-color 150ms ease;
	}

	@media (hover: hover) and (pointer: fine) {
		.link:hover {
			text-decoration-color: var(--ink);
		}
	}



	@media (max-width: 1100px) {
		.console {
			grid-template-columns: minmax(0, 1fr);
		}
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			row-gap: 18px;
		}
		.metric:nth-child(3) {
			border-left: 0;
			padding-left: 0;
		}
	}

	@media (max-width: 640px) {
		.page {
			padding: 20px 16px 32px;
		}
		.metrics {
			grid-template-columns: minmax(0, 1fr);
		}
		.metric {
			border-left: 0;
			padding-left: 0;
		}
	}
</style>
