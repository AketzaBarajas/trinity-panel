<script lang="ts">
	import { tick } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { auth } from '#lib/auth.svelte.ts';
	import { team, type WeekSession } from '#lib/team.svelte.ts';
	import { pact, REASONS, STATUS, reasonLabel, type AbsenceReason, type PactWeek, type WeekStatus } from '#lib/pact.svelte.ts';
	import { errorText } from '#lib/stopwatch.svelte.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import {
		addDaysISO,
		fmtHM,
		fmtHuman,
		fromMadridInputs,
		hhmm,
		isoWeek,
		madridDateISO,
		relDay
	} from '#lib/time.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';

	const me = $derived(auth.member!);
	const isAdmin = $derived(!!me.is_admin);
	const now = $derived(new Date(team.now));
	const today = $derived(madridDateISO(now));
	const thisWeek = $derived(pact.thisWeek);

	const memberOf = (id: string | null) => team.members.find((m) => m.id === id);
	const nameOf = (id: string | null) => memberOf(id)?.display_name ?? '—';

	// ─── Fechas ─────────────────────────────────────────────────────────────
	const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);
	const dm = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
	const dmy = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
	const short = (iso: string) => dm.format(noon(iso)).replace('.', '');
	function span(a: string, b: string) {
		if (a === b) return short(a);
		const [da, ma] = short(a).split(' ');
		const [db, mb] = short(b).split(' ');
		return ma === mb ? `${da}–${db} ${mb}` : `${short(a)} – ${short(b)}`;
	}
	const weekLabel = (monday: string) => span(monday, addDaysISO(monday, 6));
	const days = (a: string, b: string) => Math.round((noon(b).getTime() - noon(a).getTime()) / 86400000) + 1;
	const mondayOf = (iso: string) => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; // aún sin cargar o a medio escribir
		const dow = noon(iso).getUTCDay() || 7;
		return addDaysISO(iso, 1 - dow);
	};

	// ─── Esta semana ────────────────────────────────────────────────────────
	const board = $derived(
		team.members
			.map((m) => {
				const cur = pact.current(m.id);
				const minutes = team.minutesBy(m.id);
				const goal = pact.goalOf(m.id);
				return {
					m,
					c: memberColor(m.color),
					cur,
					minutes,
					goal,
					status: pact.liveStatus(m.id),
					strikes: pact.strikes(m.id),
					streak: pact.streak(m.id),
					total: pact.total(m.id),
					live: team.running(m.id).length > 0,
					absences: pact.absencesIn(m.id, thisWeek)
				};
			})
			.sort((a, b) => (a.m.id === me.id ? -1 : b.m.id === me.id ? 1 : b.minutes / (b.goal || 1) - a.minutes / (a.goal || 1)))
	);
	const started = $derived(pact.weeks.length > 0);

	function explain(r: (typeof board)[number]): string {
		const c = r.cur;
		if (!c) return '';
		if (c.absent === 7) return 'Semana justificada: sin mínimo.';
		const parts = [`mínimo ${fmtHuman(c.min_base)}`];
		if (c.absent) parts.push(`− ${c.absent} ${c.absent === 1 ? 'día justificado' : 'días justificados'}`);
		if (c.carry) parts.push(`+ ${fmtHuman(c.carry)} que recupera`);
		return parts.length > 1 ? `${parts.join(' ')} = ${fmtHuman(r.goal)}` : `${parts[0]}`;
	}

	function verdict(r: (typeof board)[number]): string {
		if (!r.cur) return 'Aún no cuenta';
		if (r.status === 'justificada') return 'Justificada';
		const left = r.goal - r.minutes;
		if (left <= 0.5) return left < -0.5 ? `Cumple · +${fmtHuman(-left)}` : 'Cumple';
		return `Le faltan ${fmtHuman(left)}`;
	}

	// ─── Historial (libro de semanas) ───────────────────────────────────────
	const MAX_WEEKS = 26;
	const columns = $derived.by(() => {
		if (!pact.weeks.length) return [] as string[];
		const first = pact.weeks.reduce((a, w) => (w.week_start < a ? w.week_start : a), thisWeek);
		const out: string[] = [];
		for (let w = thisWeek; w >= first && out.length < MAX_WEEKS; w = addDaysISO(w, -7)) out.unshift(w);
		return out;
	});
	const cellMap = $derived(new Map(pact.weeks.map((w) => [`${w.member_id}|${w.week_start}`, w])));

	type Tip = { w: PactWeek; name: string; x: number; y: number };
	let tip = $state<Tip | null>(null);
	let ledgerEl = $state<HTMLElement>();

	function showTip(e: Event, w: PactWeek, name: string) {
		const el = e.currentTarget as HTMLElement;
		if (!ledgerEl) return;
		const a = el.getBoundingClientRect();
		const b = ledgerEl.getBoundingClientRect();
		tip = { w, name, x: a.left - b.left + a.width / 2 + ledgerEl.scrollLeft, y: a.top - b.top };
	}

	const statusOf = (w: PactWeek): WeekStatus => (w.week_start === thisWeek ? (pact.liveStatus(w.member_id) ?? w.status) : w.status);
	const minutesOf = (w: PactWeek) => (w.week_start === thisWeek ? team.minutesBy(w.member_id) : w.minutes);

	function tipLine(w: PactWeek): string {
		const st = statusOf(w);
		const goal = w.target + w.carry;
		const base = `${fmtHM(minutesOf(w))} de ${fmtHuman(goal)}`;
		if (st === 'justificada') return 'Semana entera justificada';
		if (st === 'recuperando') return `${base} · le faltan ${fmtHuman(w.target - w.minutes)}: las puede recuperar esta semana`;
		if (st === 'recuperada') return `${base} · lo que faltó lo recuperó la semana siguiente`;
		if (st === 'toque') return `${base} · sin recuperar ni justificar: toque de atención`;
		if (st === 'penalizacion') return `${base} · incumplimiento n.º ${w.strike}: penalización`;
		return base;
	}

	// Al cambiar el historial, el libro se queda pegado a la semana actual (derecha).
	$effect(() => {
		void columns.length;
		void tick().then(() => ledgerEl && (ledgerEl.scrollLeft = ledgerEl.scrollWidth));
	});

	// ─── Por validar ────────────────────────────────────────────────────────
	let fixing = $state<string | null>(null);
	let fixDay = $state('');
	let fixFrom = $state('');
	let fixTo = $state('');
	let fixNote = $state('');
	let fixErr = $state<string | null>(null);
	let reviewing = $state<string | null>(null);

	const fixRange = $derived.by(() => {
		const a = fromMadridInputs(fixDay, fixFrom);
		let b = fromMadridInputs(fixDay, fixTo);
		if (!a || !b) return null;
		if (b <= a) b = fromMadridInputs(addDaysISO(fixDay, 1), fixTo);
		return b ? { a, b } : null;
	});

	function openFix(s: WeekSession) {
		fixing = s.id;
		fixDay = madridDateISO(new Date(s.started_at));
		fixFrom = hhmm(new Date(s.started_at));
		fixTo = hhmm(new Date(s.ended_at!));
		fixNote = '';
		fixErr = null;
	}

	async function review(s: WeekSession, fix = false) {
		fixErr = null;
		if (fix) {
			if (!fixRange) return void (fixErr = 'Pon la hora de inicio y la de fin.');
			if (fixNote.trim().length < 3) return void (fixErr = 'Escribe el motivo de la corrección (lo verán todos).');
		}
		reviewing = s.id;
		const { error } = await supabase.rpc('review_session', {
			p_session_id: s.id,
			p_started_at: fix ? fixRange!.a.toISOString() : null,
			p_ended_at: fix ? fixRange!.b.toISOString() : null,
			p_note: fix ? fixNote.trim() : null
		});
		reviewing = null;
		if (error) {
			const msg = errorText(error);
			if (fix) fixErr = msg;
			else toast(msg, 'bad');
			return;
		}
		pact.pending = pact.pending.filter((x) => x.id !== s.id);
		fixing = null;
		toast(fix ? `Horas de ${nameOf(s.member_id)} corregidas y validadas` : `Sesión de ${nameOf(s.member_id)} validada`, 'ok');
		void team.load();
	}

	const dur = (s: WeekSession) => team.durationOf(s);
	const hours = (s: WeekSession) => `${hhmm(new Date(s.started_at))} – ${s.ended_at ? hhmm(new Date(s.ended_at)) : 'ahora'}`;

	// ─── Ausencias ──────────────────────────────────────────────────────────
	let absWho = $state('');
	let absFrom = $state('');
	let absTo = $state('');
	let absReason = $state<AbsenceReason | ''>('');
	let absNote = $state('');
	let absBusy = $state(false);
	let absErr = $state<string | null>(null);
	let absTried = $state(false);

	const who = $derived(absWho || me.id);
	const forOther = $derived(who !== me.id);
	const reasons = $derived(REASONS.filter((r) => !r.adminOnly || (isAdmin && forOther)));
	$effect(() => {
		if (absReason && !reasons.some((r) => r.id === absReason)) absReason = '';
	});

	const absProblem = $derived.by(() => {
		if (!absFrom) return 'Elige desde qué día.';
		const to = absTo || absFrom;
		if (to < absFrom) return 'El último día va después del primero.';
		if (days(absFrom, to) > 61) return 'Como mucho 60 días seguidos.';
		if (!absReason) return 'Elige el motivo.';
		if (absReason === 'otro' && !absNote.trim()) return 'Con «Otro» hay que escribir una nota.';
		if (!forOther) {
			if (absReason === 'lesion') {
				if (absFrom < addDaysISO(today, -7)) return 'Una lesión se avisa en cuanto se pueda: como mucho 7 días después.';
			} else {
				const start = fromMadridInputs(absFrom, '00:00');
				if (start && start.getTime() - team.now < 48 * 3600_000) {
					return 'Faltan menos de 48 h: el pacto ya no la acepta. Si es una urgencia, pide a otro admin que la marque.';
				}
			}
		}
		const overlap = pact.absences.find((a) => a.member_id === who && a.starts_on <= to && a.ends_on >= absFrom);
		if (overlap) return `Ya hay una ausencia de ${nameOf(who)} del ${span(overlap.starts_on, overlap.ends_on)}.`;
		return null;
	});

	const absMin = $derived(isAdmin && forOther ? undefined : absReason === 'lesion' ? addDaysISO(today, -7) : addDaysISO(today, 2));
	const absDays = $derived(absFrom ? days(absFrom, absTo && absTo >= absFrom ? absTo : absFrom) : 0);

	async function addAbsence(e: SubmitEvent) {
		e.preventDefault();
		absTried = true;
		if (absProblem) return;
		absBusy = true;
		absErr = null;
		const { error } = await supabase.rpc('add_absence', {
			p_starts_on: absFrom,
			p_ends_on: absTo || absFrom,
			p_reason: absReason,
			p_note: absNote.trim() || null,
			p_member_id: forOther ? who : null
		});
		absBusy = false;
		if (error) {
			absErr = errorText(error);
			return;
		}
		toast(`Ausencia de ${nameOf(who)} guardada · ${absDays} ${absDays === 1 ? 'día' : 'días'}`, 'ok');
		absFrom = absTo = absNote = '';
		absReason = '';
		absTried = false;
		void pact.load();
	}

	let removing = $state<string | null>(null);
	async function removeAbsence(id: string) {
		removing = id;
		const { error } = await supabase.rpc('delete_absence', { p_absence_id: id });
		removing = null;
		if (error) return void toast(errorText(error), 'bad');
		pact.absences = pact.absences.filter((a) => a.id !== id);
		toast('Ausencia quitada', 'ok');
		void pact.load();
	}

	const upcoming = $derived(pact.absences.filter((a) => a.ends_on >= today).toSorted((a, b) => a.starts_on.localeCompare(b.starts_on)));
	const past = $derived(pact.absences.filter((a) => a.ends_on < today).slice(0, 6));
	const lateNotice = (a: { starts_on: string; created_at: string }) =>
		(fromMadridInputs(a.starts_on, '00:00')?.getTime() ?? 0) - Date.parse(a.created_at) < 48 * 3600_000;

	// ─── Reglas (admins) ────────────────────────────────────────────────────
	let minText = $state('');
	let minWhen = $state<'esta' | 'proxima'>('proxima');
	let minNote = $state('');
	let minBusy = $state(false);
	let minErr = $state<string | null>(null);
	let startText = $state('');
	let startBusy = $state(false);
	let startErr = $state<string | null>(null);

	$effect(() => {
		if (!startText && pact.pactStart) startText = pact.pactStart;
	});

	const scheduled = $derived(pact.minimums.filter((m) => m.starts_on > thisWeek));

	async function saveMinimum(e: SubmitEvent) {
		e.preventDefault();
		const h = Number(minText.trim().replace(',', '.'));
		if (!minText.trim() || !Number.isFinite(h) || h < 0 || h > 100) return void (minErr = 'Escribe las horas (p. ej. 4 o 5,5).');
		if (minNote.trim().length < 3) return void (minErr = 'Apunta cuándo lo acordasteis los tres (el pacto pide unanimidad).');
		minErr = null;
		minBusy = true;
		const starts = minWhen === 'esta' ? thisWeek : addDaysISO(thisWeek, 7);
		const { error } = await supabase.rpc('set_weekly_minimum', {
			p_minutes: Math.round(h * 60),
			p_starts_on: starts,
			p_note: minNote.trim()
		});
		minBusy = false;
		if (error) return void (minErr = errorText(error));
		toast(`Mínimo de ${fmtHuman(Math.round(h * 60))} desde el lunes ${short(starts)}`, 'ok');
		minText = minNote = '';
		void pact.load();
	}

	async function saveStart(e: SubmitEvent) {
		e.preventDefault();
		if (!startText) return void (startErr = 'Elige un día.');
		const monday = mondayOf(startText);
		startErr = null;
		startBusy = true;
		const { error } = await supabase.rpc('set_pact_start', { p_starts_on: monday });
		startBusy = false;
		if (error) return void (startErr = errorText(error));
		startText = monday;
		toast(`El pacto cuenta desde el lunes ${short(monday)}`, 'ok');
		void pact.load();
	}

	const LEGEND: WeekStatus[] = ['cumplida', 'recuperada', 'justificada', 'recuperando', 'toque', 'penalizacion', 'en_curso'];
</script>

<svelte:head>
	<title>Pacto · trinity-panel</title>
</svelte:head>

{#snippet glyph(st: WeekStatus, ratio = 0)}
	<svg class="g g-{st}" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
		{#if st === 'cumplida'}
			<circle cx="8" cy="8" r="6" />
		{:else if st === 'recuperada'}
			<circle cx="8" cy="8" r="5.4" class="ring" />
			<circle cx="8" cy="8" r="2.6" />
		{:else if st === 'justificada'}
			<circle cx="8" cy="8" r="5.4" class="ring" />
			<path d="M4.2 11.8 11.8 4.2" class="ring" />
		{:else if st === 'recuperando'}
			<circle cx="8" cy="8" r="5.4" class="ring dash" />
		{:else if st === 'toque'}
			<path d="M8 1.8 14.2 8 8 14.2 1.8 8z" />
		{:else if st === 'penalizacion'}
			<path d="M8 1.8 14.2 8 8 14.2 1.8 8z" />
			<path d="M6 6l4 4M10 6l-4 4" class="cut" />
		{:else}
			<circle cx="8" cy="8" r="5.4" class="ring dash" />
			{#if ratio > 0}
				{@const a = Math.min(ratio, 0.999) * 2 * Math.PI}
				<path d="M8 8 L8 3.4 A4.6 4.6 0 {a > Math.PI ? 1 : 0} 1 {8 + 4.6 * Math.sin(a)} {8 - 4.6 * Math.cos(a)} Z" class="pie" />
			{/if}
		{/if}
	</svg>
{/snippet}

<AppHeader />

<main class="page">
	<div class="hello">
		<h1>Pacto</h1>
		<p class="muted">
			Las reglas del PACTO DE FAMILIA aplicadas semana a semana (lunes a domingo). Lo que falta una semana se recupera solo
			en la siguiente; si no, la primera vez es un toque de atención y después, penalización.
		</p>
	</div>

	{#if pact.failed}
		<div class="alert" role="alert">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
			<span>No se ha podido calcular el pacto. Si acabas de actualizar la web, falta ejecutar la migración de la Fase 6 en Supabase. <button type="button" class="link" onclick={() => pact.load()}>Reintentar</button></span>
		</div>
	{/if}

	<!-- ─── Esta semana ─── -->
	<section aria-labelledby="semana">
		<div class="sec-head">
			<h2 id="semana">Esta semana</h2>
			<span class="muted">semana {isoWeek(now)} · {weekLabel(thisWeek)}</span>
		</div>

		{#if pact.loaded && !started && !pact.failed}
			<p class="empty">
				El pacto empieza a contar el lunes {pact.pactStart ? dmy.format(noon(pact.pactStart)) : '—'}. Hasta entonces las horas se
				guardan pero no hay estados ni toques.
			</p>
		{/if}

		<ul class="board">
			{#each board as r (r.m.id)}
				{@const fill = r.goal ? Math.min(r.minutes / r.goal, 1) : 1}
				{@const extra = r.goal ? Math.min(Math.max(r.minutes - r.goal, 0) / r.goal, 0.5) : 0}
				<li class="b-row" style:--c={r.c} class:me={r.m.id === me.id}>
					<div class="b-who">
						<span class="dot" class:live={r.live}></span>
						<span class="b-name">{r.m.display_name}{r.m.id === me.id ? ' (tú)' : ''}</span>
						{#if r.m.role_label}<span class="b-role">{r.m.role_label}</span>{/if}
					</div>

					<div class="b-bar">
						<div class="b-nums">
							<span class="num strong">{fmtHM(r.minutes)}</span>
							<span class="muted num">/ {fmtHuman(r.goal)}</span>
						</div>
						<div class="b-track" role="img" aria-label="{fmtHM(r.minutes)} de {fmtHuman(r.goal)}">
							{#if r.cur?.carry && r.goal}
								<span class="carry" style:left="{(r.cur.target / r.goal) * (100 / 1.5)}%" style:width="{(r.cur.carry / r.goal) * (100 / 1.5)}%"></span>
							{/if}
							<span class="b-fill" style:width="{(fill / 1.5) * 100}%"></span>
							{#if extra}<span class="b-extra" style:left="{(1 / 1.5) * 100}%" style:width="{(extra / 1.5) * 100}%"></span>{/if}
							<span class="b-goal" style:left="{(1 / 1.5) * 100}%"></span>
						</div>
						<span class="b-why">{explain(r)}</span>
					</div>

					<div class="b-state">
						{#if r.status}
							<span class="state tone-{STATUS[r.status].tone}">
								{@render glyph(r.status, r.goal ? r.minutes / r.goal : 0)}
								{verdict(r)}
							</span>
						{:else}
							<span class="muted">{verdict(r)}</span>
						{/if}
						{#if r.absences.length}
							<span class="b-sub">{r.absences.map((a) => `${reasonLabel(a.reason)} ${span(a.starts_on, a.ends_on)}`).join(' · ')}</span>
						{/if}
					</div>

					<dl class="b-stats">
						<div>
							<dt>Racha</dt>
							<dd class="num">{r.streak.now} <span class="muted">{r.streak.now === 1 ? 'semana' : 'semanas'}</span></dd>
						</div>
						<div>
							<dt>Mejor</dt>
							<dd class="num">{r.streak.best}</dd>
						</div>
						<div>
							<dt>Desde el inicio</dt>
							<dd class="num">{fmtHM(r.total)}</dd>
						</div>
						<div>
							<dt>Toques</dt>
							<dd class="num" class:warn={r.strikes === 1} class:bad={r.strikes > 1}>
								{r.strikes ? (r.strikes === 1 ? '1 toque' : `1 + ${r.strikes - 1} pen.`) : '0'}
							</dd>
						</div>
					</dl>
				</li>
			{/each}
		</ul>
	</section>

	<!-- ─── Historial ─── -->
	{#if columns.length}
		<section aria-labelledby="historial">
			<div class="sec-head">
				<h2 id="historial">Semana a semana</h2>
				<span class="muted">{columns.length === 1 ? 'la primera semana del pacto' : `últimas ${columns.length} semanas`}</span>
			</div>

			<div class="ledger-wrap">
				<div class="ledger" bind:this={ledgerEl} onscroll={() => (tip = null)}>
					<table>
						<caption class="visually-hidden">Estado de cada semana por persona</caption>
						<thead>
							<tr>
								<th scope="col"><span class="visually-hidden">Persona</span></th>
								{#each columns as w (w)}
									<th scope="col" class:now={w === thisWeek} title={weekLabel(w)}>
										<span class="wk num">S{isoWeek(noon(w))}</span>
										<span class="wd">{short(w)}</span>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each team.members as m (m.id)}
								<tr style:--c={memberColor(m.color)}>
									<th scope="row"><span class="dot"></span>{m.display_name}</th>
									{#each columns as w (w)}
										{@const cell = cellMap.get(`${m.id}|${w}`)}
										<td class:now={w === thisWeek}>
											{#if cell}
												{@const st = statusOf(cell)}
												<button
													type="button"
													class="cell tone-{STATUS[st].tone}"
													aria-label="{m.display_name}, {weekLabel(w)}: {STATUS[st].label}. {tipLine(cell)}"
													onpointerenter={(e) => showTip(e, cell, m.display_name)}
													onpointerleave={() => (tip = null)}
													onfocus={(e) => showTip(e, cell, m.display_name)}
													onblur={() => (tip = null)}
												>
													{@render glyph(st, (cell.target + cell.carry) ? minutesOf(cell) / (cell.target + cell.carry) : 0)}
												</button>
											{:else}
												<span class="cell none" aria-label="No contaba"></span>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if tip}
					<div class="tip" style:left="{tip.x - (ledgerEl?.scrollLeft ?? 0)}px" style:top="{tip.y}px" role="presentation">
						<span class="tip-head">
							<strong>{tip.name}</strong>
							<span class="muted">{weekLabel(tip.w.week_start)}</span>
						</span>
						<span class="tip-st tone-{STATUS[statusOf(tip.w)].tone}">{@render glyph(statusOf(tip.w))} {STATUS[statusOf(tip.w)].label}</span>
						<span class="tip-line">{tipLine(tip.w)}</span>
						{#if tip.w.absent && tip.w.absent < 7}<span class="muted">{tip.w.absent} {tip.w.absent === 1 ? 'día justificado' : 'días justificados'}</span>{/if}
					</div>
				{/if}
			</div>

			<ul class="legend" aria-label="Leyenda">
				{#each LEGEND as st (st)}
					<li class="tone-{STATUS[st].tone}">{@render glyph(st, 0.6)} {STATUS[st].label}</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- ─── Por validar ─── -->
	<section aria-labelledby="validar">
		<div class="sec-head">
			<h2 id="validar">Por validar</h2>
			<span class="muted">
				Horas a mano y sesiones que se pararon solas. Cuentan mientras tanto; las valida un admin que no sea el dueño.
			</span>
		</div>

		{#if !pact.pending.length}
			<p class="empty">Nada pendiente.</p>
		{:else}
			<ul class="queue">
				{#each pact.pending as s (s.id)}
					{@const mineS = s.member_id === me.id}
					<li style:--c={memberColor(memberOf(s.member_id)?.color)} class:open={fixing === s.id}>
						<div class="q-main">
							<span class="q-who"><span class="dot"></span>{nameOf(s.member_id)}</span>
							<span class="q-when">{relDay(new Date(s.started_at), now)} · <span class="num">{hours(s)}</span></span>
							<span class="num strong q-dur">{fmtHM(dur(s))}</span>
							<span class="q-title" class:none={!s.title}>{s.title ?? 'Sin describir aún'}</span>
							<span class="flag warn">{s.is_manual ? 'Manual' : 'Corte automático'}</span>
						</div>
						<div class="q-act">
							{#if mineS}
								<span class="muted">La valida otro admin</span>
							{:else if isAdmin && fixing !== s.id}
								<button type="button" class="btn btn-quiet" onclick={() => openFix(s)}>Corregir horas</button>
								<button type="button" class="btn" disabled={reviewing === s.id} onclick={() => review(s)}>
									{reviewing === s.id ? 'Validando…' : 'Validar'}
								</button>
							{/if}
						</div>
						{#if fixing === s.id}
							<form class="fix" onsubmit={(e) => (e.preventDefault(), review(s, true))}>
								<div class="fix-row">
									<label class="f"><span class="label">Día</span><input class="input" type="date" bind:value={fixDay} max={today} /></label>
									<label class="f"><span class="label">De</span><input class="input num" type="time" bind:value={fixFrom} /></label>
									<label class="f"><span class="label">A</span><input class="input num" type="time" bind:value={fixTo} /></label>
									<span class="fix-dur num">{fixRange ? fmtHM((fixRange.b.getTime() - fixRange.a.getTime()) / 60000) : '—'}</span>
								</div>
								<input class="input" type="text" bind:value={fixNote} maxlength="280" placeholder="Motivo (lo verán todos): p. ej. paró a las 19:10, se le olvidó el cronómetro" aria-label="Motivo de la corrección" />
								{#if fixErr}<p class="err" role="alert">{fixErr}</p>{/if}
								<div class="fix-foot">
									<button type="button" class="btn btn-quiet" onclick={() => (fixing = null)}>Cancelar</button>
									<button type="submit" class="btn btn-primary" disabled={reviewing === s.id}>{reviewing === s.id ? 'Guardando…' : 'Corregir y validar'}</button>
								</div>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<p class="help">¿Una sesión que no debería contar? Elimínala desde <a href="/sesiones">Sesiones</a> con el motivo.</p>
	</section>

	<!-- ─── Ausencias ─── -->
	<section aria-labelledby="ausencias" class="two">
		<div class="sec-head">
			<h2 id="ausencias">Ausencias justificadas</h2>
			<span class="muted">
				Exámenes, lesión o enfermedad, viajes, partidos o concentraciones. Avisa al menos 48 h antes; una lesión o enfermedad, en
				cuanto puedas. Cada día ausente baja el mínimo de esa semana en 1/7.
			</span>
		</div>

		<form class="abs" onsubmit={addAbsence} novalidate>
			{#if isAdmin}
				<div class="f-row">
					<span class="f-label" id="abs-who">Quién</span>
					<div class="chips" role="group" aria-labelledby="abs-who">
						{#each team.members as m (m.id)}
							<button type="button" class="chip" aria-pressed={who === m.id} style:--c={memberColor(m.color)} onclick={() => (absWho = m.id)}>
								<span class="cdot" aria-hidden="true"></span>{m.id === me.id ? 'Yo' : m.display_name}
							</button>
						{/each}
					</div>
				</div>
			{/if}
			<div class="f-row">
				<span class="f-label">Días</span>
				<div class="dates">
					<input class="input date" type="date" bind:value={absFrom} min={absMin} aria-label="Primer día" />
					<span class="muted" aria-hidden="true">–</span>
					<input class="input date" type="date" bind:value={absTo} min={absFrom || absMin} aria-label="Último día (opcional)" />
					{#if absDays}<span class="muted num">{absDays} {absDays === 1 ? 'día' : 'días'}</span>{/if}
				</div>
			</div>
			<div class="f-row">
				<span class="f-label" id="abs-why">Motivo</span>
				<div class="chips" role="group" aria-labelledby="abs-why">
					{#each reasons as r (r.id)}
						<button type="button" class="chip plain" aria-pressed={absReason === r.id} onclick={() => (absReason = r.id)}>{r.label}</button>
					{/each}
				</div>
			</div>
			<div class="f-row">
				<span class="f-label">Nota</span>
				<input class="input note" type="text" bind:value={absNote} maxlength="280" placeholder={absReason === 'otro' ? 'Obligatoria con «Otro»' : 'Opcional: p. ej. examen de Cálculo'} aria-label="Nota" />
			</div>
			<div class="abs-foot">
				<span class="hint" role="status">
					{#if absErr}<span class="err">{absErr}</span>{:else if absTried && absProblem}{absProblem}{:else if absProblem && absFrom && absReason}{absProblem}{/if}
				</span>
				<button type="submit" class="btn btn-primary" disabled={absBusy}>
					{absBusy ? 'Guardando…' : forOther ? `Marcar ausencia de ${nameOf(who)}` : 'Avisar ausencia'}
				</button>
			</div>
		</form>

		{#if upcoming.length || past.length}
			<ul class="abs-list">
				{#each [...upcoming, ...past] as a (a.id)}
					{@const isPast = a.ends_on < today}
					{@const canRemove = a.member_id === me.id || isAdmin}
					<li class:past={isPast} style:--c={memberColor(memberOf(a.member_id)?.color)}>
						<span class="q-who"><span class="dot"></span>{nameOf(a.member_id)}</span>
						<span class="a-what">
							<strong>{reasonLabel(a.reason)}</strong>
							<span class="num">{span(a.starts_on, a.ends_on)}</span>
							<span class="muted">· {days(a.starts_on, a.ends_on)} {days(a.starts_on, a.ends_on) === 1 ? 'día' : 'días'}</span>
							{#if a.note}<span class="muted">· {a.note}</span>{/if}
						</span>
						<span class="a-meta muted">
							{a.created_by && a.created_by !== a.member_id ? `marcada por ${nameOf(a.created_by)}` : 'avisada'} el {short(madridDateISO(new Date(a.created_at)))}
							{#if lateNotice(a) && a.created_by === a.member_id && a.reason !== 'lesion'}· con menos de 48 h{/if}
						</span>
						{#if canRemove}
							<button type="button" class="btn btn-quiet sm" disabled={removing === a.id} onclick={() => removeAbsence(a.id)}>
								{removing === a.id ? 'Quitando…' : 'Quitar'}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- ─── Reglas ─── -->
	<section aria-labelledby="reglas">
		<div class="sec-head">
			<h2 id="reglas">Reglas</h2>
			<span class="muted">Cambiarlas exige los tres de acuerdo (sección 5 del pacto). Los cambios nunca reescriben semanas pasadas.</span>
		</div>

		<dl class="rules">
			<div>
				<dt>Mínimo semanal</dt>
				<dd class="num">{fmtHuman(team.minMinutes)}</dd>
				{#if scheduled.length}<dd class="muted">Desde el {short(scheduled.at(-1)!.starts_on)}: {fmtHuman(scheduled.at(-1)!.minutes)}</dd>{/if}
			</div>
			<div>
				<dt>Cuenta desde</dt>
				<dd>{pact.pactStart ? `lunes ${dmy.format(noon(pact.pactStart))}` : '—'}</dd>
			</div>
			<div>
				<dt>Recuperar</dt>
				<dd>Solo la semana siguiente</dd>
			</div>
			<div>
				<dt>Incumplir</dt>
				<dd>1.º toque · después penalización</dd>
			</div>
		</dl>

		{#if isAdmin}
			<div class="admin">
				<form class="admin-form" onsubmit={saveMinimum} novalidate>
					<h3>Cambiar el mínimo</h3>
					<div class="admin-row">
						<label class="unit-field">
							<span class="visually-hidden">Horas por semana</span>
							<input class="input num" type="text" inputmode="decimal" bind:value={minText} placeholder={String(team.minMinutes / 60).replace('.', ',')} maxlength="5" />
							<span class="unit">h / semana</span>
						</label>
						<div class="chips" role="group" aria-label="Desde cuándo">
							<button type="button" class="chip plain" aria-pressed={minWhen === 'esta'} onclick={() => (minWhen = 'esta')}>Desde esta semana</button>
							<button type="button" class="chip plain" aria-pressed={minWhen === 'proxima'} onclick={() => (minWhen = 'proxima')}>Desde el lunes {short(addDaysISO(thisWeek, 7))}</button>
						</div>
					</div>
					<input class="input" type="text" bind:value={minNote} maxlength="280" placeholder="Acuerdo: p. ej. lo votamos los tres en Discord el 24 oct" aria-label="Acuerdo" />
					{#if minErr}<p class="err" role="alert">{minErr}</p>{/if}
					<button type="submit" class="btn" disabled={minBusy}>{minBusy ? 'Guardando…' : 'Guardar mínimo'}</button>
				</form>

				<form class="admin-form" onsubmit={saveStart} novalidate>
					<h3>Inicio del pacto</h3>
					<p class="help">Las semanas antes de este lunes no tienen estado. Si eliges otro día, se usa el lunes de esa semana.</p>
					<div class="admin-row">
						<input class="input date" type="date" bind:value={startText} aria-label="Inicio del pacto" />
						<button type="submit" class="btn" disabled={startBusy || mondayOf(startText || pact.pactStart) === pact.pactStart}>{startBusy ? 'Guardando…' : 'Guardar'}</button>
					</div>
					{#if startErr}<p class="err" role="alert">{startErr}</p>{/if}
				</form>
			</div>
		{/if}

		{#if pact.minimums.length > 1}
			<details class="changes">
				<summary>Historial del mínimo</summary>
				<ul>
					{#each pact.minimums as c (c.starts_on)}
						<li>
							<span class="num strong">{fmtHuman(c.minutes)}</span>
							<span>desde el {short(c.starts_on)}</span>
							{#if c.note}<span class="muted">· {c.note}</span>{/if}
							{#if c.changed_by}<span class="muted">· {nameOf(c.changed_by)}</span>{/if}
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>
</main>

<style>
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 28px 28px 64px;
		display: flex;
		flex-direction: column;
		gap: 44px;
	}

	h1 {
		font-size: 30px;
		font-weight: 300;
		font-style: italic;
		letter-spacing: -0.025em;
	}

	.hello p {
		margin-top: 6px;
		max-width: 72ch;
		font-size: 13px;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.sec-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 16px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--line-2);
	}

	.sec-head h2 {
		font-size: 15px;
	}

	.sec-head .muted {
		font-size: 12px;
		max-width: 80ch;
	}

	h3 {
		font-size: 13px;
		font-weight: 600;
	}

	.strong {
		color: var(--ink);
		font-weight: 500;
	}

	.empty {
		color: var(--ink-3);
		padding: 6px 0;
	}

	.dot {
		flex: 0 0 auto;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
	}

	.dot.live {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 30%, transparent);
	}

	/* ─── Glifos de estado (forma + tono: nunca solo color) ─── */
	.g {
		flex: 0 0 auto;
		fill: currentColor;
	}

	.g .ring {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
	}

	.g .dash {
		stroke-dasharray: 2.2 2;
	}

	.g .pie {
		fill: currentColor;
		opacity: 0.7;
	}

	.g .cut {
		fill: none;
		stroke: var(--bg);
		stroke-width: 1.6;
		stroke-linecap: round;
	}

	.tone-ok {
		color: var(--ink);
	}

	.tone-soft {
		color: var(--ink-3);
	}

	.tone-warn {
		color: var(--warn);
	}

	.tone-bad {
		color: var(--bad);
	}

	.tone-open {
		color: var(--ink-2);
	}

	/* ─── Esta semana ─── */
	.board {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.b-row {
		display: grid;
		grid-template-columns: 170px minmax(220px, 1.4fr) minmax(170px, 0.9fr) auto;
		align-items: center;
		gap: 24px;
		padding: 16px 0;
		border-bottom: 1px solid var(--line);
	}

	.b-who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 9px;
		min-width: 0;
	}

	.b-name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.b-role {
		flex-basis: 100%;
		padding-left: 16px;
		font-size: 12px;
		color: var(--ink-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.b-bar {
		display: flex;
		flex-direction: column;
		gap: 7px;
		min-width: 0;
	}

	.b-nums {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 13px;
	}

	.b-nums .strong {
		font-size: 17px;
		font-weight: 600;
	}

	.b-track {
		position: relative;
		height: 6px;
		border-radius: 3px;
		background: var(--line-2);
	}

	.b-fill,
	.b-extra,
	.carry {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		border-radius: 3px;
		transition:
			width 600ms var(--ease-out),
			left 600ms var(--ease-out);
	}

	.b-fill {
		background: var(--c);
	}

	.b-extra {
		background: color-mix(in srgb, var(--c) 45%, transparent);
		border-radius: 0 3px 3px 0;
	}

	/* Lo que se recupera: el tramo final del objetivo, rayado. */
	.carry {
		border-radius: 0 3px 3px 0;
		background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--warn) 55%, transparent) 0 2px, transparent 2px 5px);
	}

	.b-goal {
		position: absolute;
		top: -4px;
		width: 1px;
		height: 14px;
		background: var(--ink-2);
	}

	.b-why {
		font-size: 12px;
		color: var(--ink-3);
	}

	.b-state {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}

	.state {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
	}

	.b-sub {
		font-size: 12px;
		color: var(--ink-3);
		padding-left: 24px;
	}

	.b-stats {
		display: grid;
		grid-template-columns: repeat(4, auto);
		gap: 0;
		margin: 0;
	}

	.b-stats div {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 0 16px;
		border-left: 1px solid var(--line);
	}

	.b-stats dt {
		font-size: 11.5px;
		color: var(--ink-3);
		white-space: nowrap;
	}

	.b-stats dd {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
	}

	.b-stats dd .muted {
		font-weight: 400;
		font-size: 12px;
	}

	.b-stats .warn {
		color: var(--warn);
	}

	.b-stats .bad {
		color: var(--bad);
	}

	/* ─── Libro de semanas ─── */
	.ledger-wrap {
		position: relative;
	}

	.ledger {
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.ledger table {
		border-collapse: collapse;
	}

	.ledger th,
	.ledger td {
		padding: 0;
		font-weight: 400;
	}

	.ledger thead th {
		padding: 0 0 10px;
		min-width: 46px;
		text-align: center;
		vertical-align: bottom;
	}

	.wk,
	.wd {
		display: block;
		font-size: 11px;
		line-height: 1.3;
	}

	.wk {
		color: var(--ink-2);
	}

	.wd {
		color: var(--ink-3);
	}

	thead th.now .wk {
		color: var(--ink);
		font-weight: 600;
	}

	.ledger tbody th {
		position: sticky;
		left: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 9px;
		min-width: 150px;
		height: 44px;
		padding-right: 16px;
		background: var(--bg);
		text-align: left;
		font-weight: 500;
		white-space: nowrap;
	}

	.ledger tbody tr + tr th,
	.ledger tbody tr + tr td {
		border-top: 1px solid var(--line);
	}

	.ledger td {
		text-align: center;
		height: 44px;
	}

	.ledger td.now {
		background: color-mix(in srgb, var(--line) 60%, transparent);
	}

	.cell {
		display: inline-grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: transparent;
		cursor: default;
		transition:
			background-color 150ms ease,
			transform 140ms var(--ease-out);
	}

	.cell:focus-visible,
	.cell:hover {
		background: var(--line-2);
	}

	.cell:active {
		transform: scale(0.94);
	}

	.cell.none {
		position: relative;
		display: inline-block;
	}

	.cell.none::after {
		content: '';
		position: absolute;
		left: 9px;
		right: 9px;
		top: 50%;
		height: 1px;
		background: var(--line-2);
	}

	.tip {
		position: absolute;
		z-index: 5;
		transform: translate(-50%, calc(-100% - 8px));
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: max-content;
		max-width: 280px;
		padding: 10px 12px;
		border-radius: var(--r-sm);
		border: 1px solid var(--line-2);
		background: var(--bg-raised);
		box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.55);
		font-size: 12px;
		pointer-events: none;
		animation: tip-in 140ms var(--ease-out);
	}

	@keyframes tip-in {
		from {
			opacity: 0;
			transform: translate(-50%, calc(-100% - 4px));
		}
	}

	.tip-head {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}

	.tip-st {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
	}

	.tip-line {
		color: var(--ink-2);
		text-wrap: pretty;
	}

	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		font-size: 12px;
	}

	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	/* ─── Por validar ─── */
	.queue,
	.abs-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.queue li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px 20px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}

	.queue li.open {
		background: color-mix(in srgb, var(--line) 50%, transparent);
		margin: 0 -12px;
		padding: 12px;
		border-radius: var(--r-sm);
	}

	.q-main {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 16px;
		min-width: 0;
	}

	.q-who {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
		white-space: nowrap;
	}

	.q-when {
		color: var(--ink-2);
		white-space: nowrap;
	}

	.q-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 46ch;
	}

	.q-title.none {
		color: var(--ink-3);
		font-style: italic;
	}

	.flag {
		font-size: 11px;
		padding: 0 6px;
		border-radius: 5px;
		border: 1px solid var(--line-2);
	}

	.flag.warn {
		color: var(--warn);
		border-color: color-mix(in srgb, var(--warn) 40%, transparent);
	}

	.q-act {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
	}

	.fix {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		animation: open 200ms var(--ease-out);
	}

	@keyframes open {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	.fix-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
	}

	.f {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.f .input {
		height: 36px;
		width: auto;
	}

	.fix-dur {
		padding-bottom: 8px;
		font-size: 17px;
		font-weight: 600;
	}

	.fix-foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.err {
		font-size: 12px;
		color: var(--bad);
	}

	/* ─── Ausencias ─── */
	.abs {
		display: flex;
		flex-direction: column;
	}

	.f-row {
		display: grid;
		grid-template-columns: 104px 1fr;
		align-items: center;
		gap: 12px;
		padding: 9px 0;
		border-bottom: 1px solid var(--line);
	}

	.f-label {
		font-size: 12px;
		color: var(--ink-3);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 11px;
		border-radius: 999px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--ink-3);
		font-size: 12px;
		cursor: pointer;
		transition:
			color 150ms ease,
			border-color 150ms ease,
			background-color 150ms ease,
			transform 120ms var(--ease-out);
	}

	.chip:active {
		transform: scale(0.96);
	}

	.chip[aria-pressed='true'] {
		color: var(--ink);
		border-color: var(--line-2);
		background: var(--bg-raised);
	}

	@media (hover: hover) and (pointer: fine) {
		.chip:hover {
			color: var(--ink);
		}
	}

	.cdot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
	}

	.chip[aria-pressed='true'] .cdot {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 22%, transparent);
	}

	.dates {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}

	.date {
		width: 150px;
		height: 32px;
		padding: 0 8px;
		font-size: 12.5px;
	}

	.date::-webkit-calendar-picker-indicator {
		opacity: 0.55;
		cursor: pointer;
	}

	.note {
		height: 34px;
		max-width: 520px;
		font-size: 13px;
	}

	.abs-foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 14px;
		padding-top: 12px;
	}

	.hint {
		font-size: 12px;
		color: var(--warn);
		text-align: right;
		text-wrap: pretty;
	}

	.abs-list {
		margin-top: 6px;
	}

	.abs-list li {
		display: grid;
		grid-template-columns: 150px minmax(0, 1fr) auto auto;
		align-items: baseline;
		gap: 6px 18px;
		padding: 11px 0;
		border-bottom: 1px solid var(--line);
	}

	.abs-list li.past {
		opacity: 0.6;
	}

	.a-what {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		min-width: 0;
	}

	.a-what strong {
		font-weight: 600;
	}

	.a-meta {
		font-size: 12px;
		white-space: nowrap;
	}

	.btn.sm {
		height: 28px;
		padding: 0 10px;
		font-size: 12px;
	}

	/* ─── Reglas ─── */
	.rules {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin: 0;
	}

	.rules div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 24px;
		border-left: 1px solid var(--line);
	}

	.rules div:first-child {
		padding-left: 0;
		border-left: 0;
	}

	.rules dt {
		font-size: 12px;
		color: var(--ink-3);
	}

	.rules dd {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
	}

	.rules dd.muted {
		font-size: 12px;
		font-weight: 400;
	}

	.admin {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
		gap: 44px;
		margin-top: 12px;
		padding-top: 20px;
		border-top: 1px solid var(--line);
	}

	.admin-form {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}

	.admin-form > .input {
		height: 36px;
		font-size: 13px;
	}

	.admin-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.unit-field {
		position: relative;
		display: flex;
		align-items: center;
		width: 170px;
	}

	.unit-field .input {
		height: 36px;
		padding-right: 88px;
	}

	.unit {
		position: absolute;
		right: 12px;
		font-size: 12px;
		color: var(--ink-3);
		pointer-events: none;
	}

	.changes {
		margin-top: 8px;
		font-size: 12.5px;
	}

	.changes summary {
		cursor: pointer;
		color: var(--ink-2);
		width: max-content;
	}

	.changes ul {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.changes li {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.help a {
		color: var(--ink-2);
	}

	@media (max-width: 1100px) {
		.b-row {
			grid-template-columns: 150px minmax(0, 1fr) minmax(150px, auto);
		}
		.b-stats {
			grid-column: 2 / -1;
			justify-self: start;
		}
		.b-stats div:first-child {
			padding-left: 0;
			border-left: 0;
		}
		.admin {
			grid-template-columns: minmax(0, 1fr);
			gap: 28px;
		}
	}

	@media (max-width: 760px) {
		.page {
			padding: 20px 16px 48px;
		}
		.b-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 10px;
		}
		.b-stats {
			grid-column: auto;
			grid-template-columns: repeat(2, auto);
			row-gap: 8px;
		}
		.b-stats div:nth-child(3) {
			padding-left: 0;
			border-left: 0;
		}
		.rules {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			row-gap: 16px;
		}
		.rules div:nth-child(3) {
			padding-left: 0;
			border-left: 0;
		}
		.f-row {
			grid-template-columns: 1fr;
			gap: 6px;
		}
		.abs-list li,
		.queue li {
			grid-template-columns: minmax(0, 1fr);
		}
		.abs-foot {
			flex-direction: column;
			align-items: stretch;
		}
		.hint {
			text-align: left;
		}
	}
</style>
