<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { supabase } from '#lib/supabase.ts';
	import { auth } from '#lib/auth.svelte.ts';
	import { team, type WeekSession } from '#lib/team.svelte.ts';
	import { errorText, stopwatch } from '#lib/stopwatch.svelte.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import { fmtHM, hhmm, relDay, madridDateISO } from '#lib/time.ts';
	import {
		PRESETS,
		activeCount,
		emptyFilters,
		emptyResult,
		fromParams,
		groupByDay,
		highlight,
		presetRange,
		toParams,
		type Filters,
		type LogResult,
		type LogRow,
		type Preset
	} from '#lib/registry.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';

	interface Deletion {
		id: string;
		member_id: string;
		started_at: string;
		ended_at: string | null;
		title: string | null;
		reason: string;
		deleted_by: string;
		deleted_at: string;
	}

	interface ProjectOpt {
		id: string;
		name: string;
		is_archived: boolean;
	}

	const PAGE = 50;
	const REASON_MAX = 280;

	// ─── Filtros ────────────────────────────────────────────────────────────
	let filters = $state<Filters>(fromParams(page.url.searchParams));
	let qInput = $state(untrack(() => filters.q));
	let searchEl = $state<HTMLInputElement>();

	// Solo cambia al cambiar de día (no cada segundo con el cronómetro en marcha).
	const today = $derived(madridDateISO(new Date(team.now)));
	const range = $derived(
		presetRange(filters.preset, new Date(`${today}T12:00:00Z`), { from: filters.from, to: filters.to })
	);
	const nActive = $derived(activeCount(filters));

	/** Lo que se le pide al servidor. Si no cambia el texto, no se recarga. */
	const query = $derived(
		JSON.stringify({
			p_members: filters.members.length ? filters.members : null,
			p_specialties: filters.specialties.length ? filters.specialties : null,
			p_projects: filters.projects.length ? filters.projects : null,
			p_from: range.from || null,
			p_to: range.to || null,
			p_q: filters.q.trim() || null
		})
	);

	// ─── Datos ──────────────────────────────────────────────────────────────
	let result = $state<LogResult>(emptyResult());
	let deletions = $state<Deletion[]>([]);
	let projects = $state<ProjectOpt[]>([]);
	let limit = $state(PAGE);
	let loaded = $state(false);
	let busy = $state(false);
	let dim = $state(false); // atenuar solo si la respuesta tarda (sin parpadeos)
	let loadingMore = $state(false);
	let failed = $state(false);
	let seq = 0;

	const hasMore = $derived(result.rows.length < result.total_count);
	const groups = $derived(groupByDay(result.rows));
	const dayTotals = $derived(new Map(result.by_day.map((d) => [d.day, d])));
	const memberTotals = $derived(
		team.members
			.map((m) => ({ m, t: result.by_member.find((x) => x.member_id === m.id) }))
			.filter((x) => x.t && x.t.minutes > 0)
			.map((x) => ({ ...x.m, minutes: x.t!.minutes, count: x.t!.count }))
	);
	const showProjects = $derived(projects.length > 1);

	// ─── Eliminar (admins) ──────────────────────────────────────────────────
	let target = $state<string | null>(null);
	let reason = $state('');
	let deleting = $state(false);
	let reasonError = $state<string | null>(null);
	let reasonEl = $state<HTMLInputElement>();

	const me = $derived(auth.member!);
	const isAdmin = $derived(!!me.is_admin);
	const now = $derived(new Date(team.now));

	const memberOf = (id: string) => team.members.find((m) => m.id === id);
	const nameOf = (id: string) => memberOf(id)?.display_name ?? '—';
	const specOf = (slug: string) => team.specialties.find((s) => s.slug === slug);
	const projectOf = (id: string) => projects.find((p) => p.id === id);

	async function load(keepLimit = true) {
		const id = ++seq;
		const args = { ...JSON.parse(query), p_limit: keepLimit ? Math.max(limit, PAGE) : PAGE, p_offset: 0 };
		if (!keepLimit) limit = PAGE;
		busy = true;
		const slow = setTimeout(() => id === seq && (dim = true), 160);
		const { data, error } = await supabase.rpc('session_log', args);
		clearTimeout(slow);
		if (id !== seq) return;
		busy = false;
		dim = false;
		if (error) {
			failed = true;
			loaded = true;
			return;
		}
		failed = false;
		result = { ...emptyResult(), ...(data as LogResult) };
		loaded = true;
	}

	async function loadDeletions() {
		const { data } = await supabase
			.from('session_deletions')
			.select('id, member_id, started_at, ended_at, title, reason, deleted_by, deleted_at')
			.order('deleted_at', { ascending: false })
			.limit(10);
		deletions = (data ?? []) as Deletion[];
	}

	// Filtros nuevos → primera página y URL al día.
	$effect(() => {
		void query;
		untrack(() => {
			void load(false);
			const next = page.url.pathname + toParams(filters);
			if (next !== page.url.pathname + page.url.search) {
				try {
					replaceState(next, {});
				} catch {
					// El router aún no está listo: la URL se pondrá al día con el próximo cambio.
				}
			}
		});
	});

	// El buscador espera a que dejes de escribir.
	$effect(() => {
		const v = qInput;
		const t = setTimeout(() => (filters.q = v), 220);
		return () => clearTimeout(t);
	});

	onMount(() => {
		void loadDeletions();
		void supabase
			.from('projects')
			.select('id, name, is_archived')
			.order('created_at')
			.then(({ data }) => (projects = (data ?? []) as ProjectOpt[]));

		let timer: ReturnType<typeof setTimeout> | null = null;
		const soon = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				void load();
				void loadDeletions();
			}, 150);
		};
		const channel = supabase
			.channel('registro')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, soon)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'session_specialties' }, soon)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'session_deletions' }, soon)
			.subscribe();
		return () => {
			if (timer) clearTimeout(timer);
			void supabase.removeChannel(channel);
		};
	});

	async function more() {
		loadingMore = true;
		limit = result.rows.length + PAGE;
		await load();
		loadingMore = false;
	}

	// ─── Acciones de filtro ─────────────────────────────────────────────────
	const toggle = (key: 'members' | 'specialties' | 'projects', id: string) => {
		const arr = filters[key];
		filters[key] = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
	};

	function setPreset(p: Exclude<Preset, 'rango'>) {
		filters.preset = p;
		filters.from = '';
		filters.to = '';
	}

	function setDate(which: 'from' | 'to', v: string) {
		const r = range;
		filters.from = which === 'from' ? v : r.from;
		filters.to = which === 'to' ? v : r.to;
		filters.preset = filters.from || filters.to ? 'rango' : 'todo';
	}

	function clearAll() {
		filters = emptyFilters();
		qInput = '';
	}

	function onSearchKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && qInput) {
			e.preventDefault();
			qInput = '';
			filters.q = '';
		} else if (e.key === 'Enter') {
			filters.q = qInput; // sin esperar
		}
	}

	function onWindowKey(e: KeyboardEvent) {
		if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
		const el = e.target as HTMLElement | null;
		if (el?.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
		e.preventDefault();
		searchEl?.focus();
		searchEl?.select();
	}

	// ─── Eliminar ───────────────────────────────────────────────────────────
	async function ask(id: string) {
		target = id;
		reason = '';
		reasonError = null;
		await tick();
		reasonEl?.focus();
	}

	function cancel() {
		target = null;
		reasonError = null;
	}

	async function confirmDelete(e: SubmitEvent) {
		e.preventDefault();
		const id = target;
		if (!id) return;
		const why = reason.trim();
		if (why.length < 3) {
			reasonError = 'Escribe el motivo (mínimo 3 caracteres). Lo verán todos.';
			reasonEl?.focus();
			return;
		}

		deleting = true;
		const { error } = await supabase.rpc('admin_delete_session', { p_session_id: id, p_reason: why });
		deleting = false;

		if (error) {
			reasonError = errorText(error);
			return;
		}

		const s = result.rows.find((r) => r.id === id);
		result.rows = result.rows.filter((r) => r.id !== id);
		team.commit((l) => l.filter((x) => x.id !== id));
		target = null;
		toast(s ? `Sesión de ${nameOf(s.member_id)} eliminada · ${fmtHM(team.durationOf(s))}` : 'Sesión eliminada', 'ok');
		void load();
		void loadDeletions();
	}

	function onConfirmKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		}
	}

	// ─── Formato ────────────────────────────────────────────────────────────
	const span = (a: string, b: string | null) => `${hhmm(new Date(a))} – ${b ? hhmm(new Date(b)) : 'ahora'}`;
	const dayDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	const fmtDayInput = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

	const rangeLabel = $derived.by(() => {
		if (!range.from && !range.to) return 'desde el principio';
		if (range.from && range.to) {
			return range.from === range.to ? `el ${fmtDayInput(range.from)}` : `del ${fmtDayInput(range.from)} al ${fmtDayInput(range.to)}`;
		}
		return range.from ? `desde el ${fmtDayInput(range.from)}` : `hasta el ${fmtDayInput(range.to)}`;
	});

	const avg = $derived(result.total_count ? result.total_minutes / result.total_count : 0);
</script>

<svelte:head>
	<title>Sesiones · trinity-panel</title>
</svelte:head>

<svelte:window onkeydown={onWindowKey} />

{#snippet marked(text: string)}
	{#each highlight(text, filters.q) as part, i (i)}{#if part.hit}<mark>{part.t}</mark>{:else}{part.t}{/if}{/each}
{/snippet}

<AppHeader />

<main class="page">
	<div class="hello">
		<h1>Sesiones</h1>
		<p class="muted">
			El registro de todo lo que ha hecho el equipo. Filtra por persona, fechas, especialidad o proyecto, o
			busca en lo que se hizo.
			{#if isAdmin}Como admin puedes eliminar cualquier sesión; el motivo queda a la vista de todos.{/if}
		</p>
	</div>

	<!-- ─── Filtros ─── -->
	<section class="filters" aria-label="Filtros del registro">
		<div class="f-top">
			<label class="search">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
				<span class="visually-hidden">Buscar en la frase y la descripción</span>
				<input
					bind:this={searchEl}
					bind:value={qInput}
					onkeydown={onSearchKey}
					type="search"
					class="input"
					placeholder="Buscar en lo que se hizo…"
					maxlength="100"
					autocomplete="off"
					spellcheck="false"
				/>
				{#if qInput}
					<button type="button" class="clear-q" onclick={() => ((qInput = ''), (filters.q = ''), searchEl?.focus())} aria-label="Borrar búsqueda">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
					</button>
				{:else}
					<kbd aria-hidden="true">/</kbd>
				{/if}
			</label>

			<div class="dates">
				<div class="chips" role="group" aria-label="Fechas">
					{#each PRESETS as p (p.id)}
						<button type="button" class="chip" aria-pressed={filters.preset === p.id} onclick={() => setPreset(p.id)}>{p.label}</button>
					{/each}
				</div>
				<div class="range" class:on={filters.preset === 'rango'}>
					<input
						type="date"
						class="input date"
						value={range.from}
						max={range.to || today}
						onchange={(e) => setDate('from', e.currentTarget.value)}
						aria-label="Desde"
					/>
					<span class="muted" aria-hidden="true">–</span>
					<input
						type="date"
						class="input date"
						value={range.to}
						min={range.from || undefined}
						max={today}
						onchange={(e) => setDate('to', e.currentTarget.value)}
						aria-label="Hasta"
					/>
				</div>
			</div>
		</div>

		<div class="f-row">
			<span class="f-label" id="f-persona">Persona</span>
			<div class="chips" role="group" aria-labelledby="f-persona">
				<button type="button" class="chip" aria-pressed={!filters.members.length} onclick={() => (filters.members = [])}>Todos</button>
				{#each team.members as m (m.id)}
					<button type="button" class="chip" aria-pressed={filters.members.includes(m.id)} style:--c={memberColor(m.color)} onclick={() => toggle('members', m.id)}>
						<span class="dot" aria-hidden="true"></span>{m.display_name}
					</button>
				{/each}
			</div>
		</div>

		<div class="f-row">
			<span class="f-label" id="f-esp">Especialidad</span>
			<div class="chips" role="group" aria-labelledby="f-esp">
				<button type="button" class="chip" aria-pressed={!filters.specialties.length} onclick={() => (filters.specialties = [])}>Todas</button>
				{#each team.specialties as sp (sp.slug)}
					<button type="button" class="chip" aria-pressed={filters.specialties.includes(sp.slug)} style:--c={sp.color} onclick={() => toggle('specialties', sp.slug)}>
						<span class="dot" aria-hidden="true"></span>{sp.name}
					</button>
				{/each}
			</div>
		</div>

		{#if showProjects}
			<div class="f-row">
				<span class="f-label" id="f-proy">Proyecto</span>
				<div class="chips" role="group" aria-labelledby="f-proy">
					<button type="button" class="chip" aria-pressed={!filters.projects.length} onclick={() => (filters.projects = [])}>Todos</button>
					{#each projects as p (p.id)}
						<button type="button" class="chip" aria-pressed={filters.projects.includes(p.id)} onclick={() => toggle('projects', p.id)}>
							{p.name}{#if p.is_archived}<span class="muted">&nbsp;· archivado</span>{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</section>

	<!-- ─── Totales del filtro ─── -->
	<section class="summary" aria-label="Totales del filtro" aria-live="polite" aria-busy={busy}>
		<div class="metric">
			<span class="m-value num">{fmtHM(result.total_minutes)}</span>
			<span class="m-label">{rangeLabel}</span>
		</div>
		<div class="metric">
			<span class="m-value num">{result.total_count}</span>
			<span class="m-label">{result.total_count === 1 ? 'sesión' : 'sesiones'}</span>
		</div>
		<div class="metric">
			<span class="m-value num">{fmtHM(avg)}</span>
			<span class="m-label">de media por sesión</span>
		</div>
		<div class="metric split">
			{#if memberTotals.length}
				<div class="split-bar" role="img" aria-label="Reparto: {memberTotals.map((m) => `${m.display_name} ${fmtHM(m.minutes)}`).join(', ')}">
					{#each memberTotals as m (m.id)}
						<span style:flex-grow={m.minutes} style:--c={memberColor(m.color)}></span>
					{/each}
				</div>
				<ul class="split-legend">
					{#each memberTotals as m (m.id)}
						<li style:--c={memberColor(m.color)}>
							<span class="dot" aria-hidden="true"></span>{m.display_name}
							<span class="num">{fmtHM(m.minutes)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<span class="m-label">Sin horas en este filtro</span>
			{/if}
		</div>
		{#if nActive}
			<button type="button" class="btn btn-quiet reset" onclick={clearAll}>
				Quitar filtros <span class="count num">{nActive}</span>
			</button>
		{/if}
	</section>

	<!-- ─── Lista ─── -->
	{#if !loaded}
		<div class="skeleton" aria-hidden="true">
			{#each [0, 1, 2, 3, 4] as i (i)}<span style:animation-delay="{i * 80}ms"></span>{/each}
		</div>
		<span class="visually-hidden" role="status">Cargando sesiones…</span>
	{:else if failed}
		<div class="alert" role="alert">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
			<span>No se ha podido cargar el registro. Si acabas de actualizar la web, falta ejecutar la migración de la Fase 5 en Supabase. <button type="button" class="link" onclick={() => load(false)}>Reintentar</button></span>
		</div>
	{:else if !result.rows.length}
		<div class="empty">
			{#if nActive}
				<p>Nada con estos filtros.</p>
				<button type="button" class="btn" onclick={clearAll}>Quitar filtros</button>
			{:else}
				<p>Aún no hay sesiones. La primera que se guarde aparecerá aquí.</p>
			{/if}
		</div>
	{:else}
		<table class="list" class:dim>
			<caption class="visually-hidden">Sesiones del equipo, agrupadas por día</caption>
			<thead>
				<tr>
					<th scope="col">Persona</th>
					<th scope="col" class="c-time">Horario</th>
					<th scope="col" class="r">Duración</th>
					<th scope="col">Qué se hizo</th>
					<th scope="col"><span class="visually-hidden">Acciones</span></th>
				</tr>
			</thead>
			{#each groups as g (g.day)}
				{@const dt = dayTotals.get(g.day)}
				<tbody>
					<tr class="day-row">
						<th colspan="5" scope="rowgroup">
							<div class="day-in">
								<span class="day-name">{relDay(dayDate(g.day), now)}</span>
								{#if dt}
									<span class="day-sum">
										<span>{plural(dt.count, 'sesión', 'sesiones')}</span>
										<span class="num strong">{fmtHM(dt.minutes)}</span>
									</span>
								{/if}
							</div>
						</th>
					</tr>
					{#each g.rows as s (s.id)}
						{@render row(s)}
					{/each}
				</tbody>
			{/each}
		</table>

		<div class="foot">
			<span class="muted">Mostrando {result.rows.length} de {result.total_count}</span>
			{#if hasMore}
				<button type="button" class="btn" onclick={more} disabled={loadingMore}>
					{loadingMore ? 'Cargando…' : 'Ver más antiguas'}
				</button>
			{/if}
		</div>
	{/if}

	{#if deletions.length}
		<section class="log" aria-labelledby="eliminadas">
			<h2 id="eliminadas">Eliminadas recientemente</h2>
			<ul>
				{#each deletions as d (d.id)}
					<li>
						<span class="log-main">
							<strong>{nameOf(d.deleted_by)}</strong> eliminó
							<span class="num">{fmtHM(((d.ended_at ? Date.parse(d.ended_at) : Date.parse(d.deleted_at)) - Date.parse(d.started_at)) / 60000)}</span>
							de <strong>{nameOf(d.member_id)}</strong>
							<span class="muted">({relDay(new Date(d.started_at), now)}, {span(d.started_at, d.ended_at)}{d.title ? ` · ${d.title}` : ''})</span>
						</span>
						<span class="log-why">“{d.reason}” <span class="muted">· {relDay(new Date(d.deleted_at), now)} {hhmm(new Date(d.deleted_at))}</span></span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

{#snippet row(s: LogRow)}
	{@const running = !s.ended_at}
	{@const canEdit = !running && (s.member_id === me.id || isAdmin)}
	{@const name = nameOf(s.member_id)}
	{@const picked = filters.members.includes(s.member_id)}
	<tr class:sel={target === s.id} style:--c={memberColor(memberOf(s.member_id)?.color)}>
		<td>
			<button
				type="button"
				class="who"
				aria-pressed={picked}
				onclick={() => toggle('members', s.member_id)}
				title={picked ? `Quitar el filtro de ${name}` : `Ver solo a ${name}`}
			>
				<span class="dot" class:live={running}></span>{name}
			</button>
		</td>
		<td class="num time c-time">{span(s.started_at, s.ended_at)}</td>
		<td class="num r dur">{fmtHM(team.durationOf(s))}</td>
		<td class="what">
			<span class="title" class:none={!s.title}>
				{#if s.title}{@render marked(s.title)}{:else}{running ? 'En marcha' : 'Sin describir'}{/if}
			</span>
			{#if s.description}
				<span class="desc">{@render marked(s.description)}</span>
			{/if}
			<span class="tags">
				{#each s.specialties as slug (slug)}
					{@const sp = specOf(slug)}
					{#if sp}
						<button
							type="button"
							class="spec"
							class:on={filters.specialties.includes(slug)}
							style:--sc={sp.color}
							onclick={() => toggle('specialties', slug)}
							title={filters.specialties.includes(slug) ? `Quitar el filtro ${sp.name}` : `Ver solo ${sp.name}`}
						>{sp.name}</button>
					{/if}
				{/each}
				{#if showProjects}<span class="proj">{projectOf(s.project_id)?.name ?? ''}</span>{/if}
				{#if s.needs_review}
					<span class="flag warn">{s.is_manual ? 'Manual' : 'Corte automático'} · por validar</span>
				{:else if s.is_manual}
					<span class="flag">Manual</span>
				{/if}
				{#if s.reviewed_by}
					<span class="reviewed">{s.review_action === 'corregida' ? 'Horas corregidas' : 'Validada'} por {nameOf(s.reviewed_by)}</span>
				{/if}
				{#if running}<span class="flag live">En marcha</span>{/if}
			</span>
		</td>
		<td class="act">
			{#if canEdit && target !== s.id}
				<button
					type="button"
					class="del edit"
					onclick={() => stopwatch.openEdit(s)}
					aria-label="Editar la frase de la sesión de {name} del {relDay(new Date(s.started_at), now)}"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" /></svg>
					<span class="del-label">Editar</span>
				</button>
			{/if}
			{#if isAdmin && target !== s.id}
				<button
					type="button"
					class="del"
					onclick={() => ask(s.id)}
					aria-label="Eliminar la sesión de {name} del {relDay(new Date(s.started_at), now)}, {span(s.started_at, s.ended_at)}"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
					<span class="del-label">Eliminar</span>
				</button>
			{/if}
		</td>
	</tr>
	{#if target === s.id}
		<tr class="confirm-row">
			<td colspan="5">
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<form class="confirm" onsubmit={confirmDelete} onkeydown={onConfirmKey}>
					<p class="confirm-q">
						¿Eliminar <strong>{fmtHM(team.durationOf(s))}</strong> de {name}?
						Dejarán de contar y no se puede deshacer.
					</p>
					<div class="confirm-row-in">
						<input
							bind:this={reasonEl}
							class="input"
							class:invalid={!!reasonError}
							type="text"
							bind:value={reason}
							maxlength={REASON_MAX}
							placeholder="Motivo (lo verán todos): p. ej. se olvidó de pararlo"
							aria-label="Motivo de la eliminación"
							aria-invalid={!!reasonError}
							autocomplete="off"
						/>
						<button type="button" class="btn btn-quiet" onclick={cancel}>Cancelar</button>
						<button type="submit" class="btn danger" disabled={deleting}>
							{deleting ? 'Eliminando…' : 'Eliminar sesión'}
						</button>
					</div>
					{#if reasonError}<p class="err" role="alert">{reasonError}</p>{/if}
				</form>
			</td>
		</tr>
	{/if}
{/snippet}

<style>
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 28px 28px 56px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	h1 {
		font-size: 30px;
		font-weight: 300;
		font-style: italic;
		letter-spacing: -0.025em;
	}

	.hello p {
		margin-top: 6px;
		max-width: 70ch;
		font-size: 13px;
	}

	/* ─── Filtros ─── */
	.filters {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}

	.f-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 20px;
		padding: 14px 0;
	}

	.search {
		position: relative;
		flex: 1 1 280px;
		max-width: 420px;
		display: flex;
		align-items: center;
	}

	.search > svg {
		position: absolute;
		left: 12px;
		color: var(--ink-3);
		pointer-events: none;
	}

	.search .input {
		height: 36px;
		padding-left: 34px;
		padding-right: 36px;
		font-size: 13px;
	}

	.search .input::-webkit-search-cancel-button {
		display: none;
	}

	kbd,
	.clear-q {
		position: absolute;
		right: 8px;
		display: grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		border-radius: 5px;
	}

	kbd {
		padding: 0 5px;
		border: 1px solid var(--line-2);
		color: var(--ink-3);
		font: 500 11px var(--font-sans);
		pointer-events: none;
	}

	.clear-q {
		border: 0;
		background: var(--line);
		color: var(--ink-2);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease,
			transform 120ms var(--ease-out);
	}

	.clear-q:active {
		transform: scale(0.92);
	}

	@media (hover: hover) and (pointer: fine) {
		.clear-q:hover {
			color: var(--ink);
			background: var(--line-2);
		}
	}

	.dates {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
		margin-left: auto;
	}

	.range {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.date {
		width: 132px;
		height: 30px;
		padding: 0 8px;
		font-size: 12px;
		color: var(--ink-2);
		border-color: var(--line);
		background: transparent;
	}

	.range.on .date {
		color: var(--ink);
		border-color: var(--line-2);
		background: var(--bg-sunken);
	}

	.date::-webkit-calendar-picker-indicator {
		opacity: 0.55;
		cursor: pointer;
	}

	.f-row {
		display: grid;
		grid-template-columns: 104px 1fr;
		align-items: center;
		gap: 12px;
		padding: 9px 0;
		border-top: 1px solid var(--line);
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
		-webkit-tap-highlight-color: transparent;
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

	.chip[aria-pressed='true'] .dot {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 22%, transparent);
	}

	@media (hover: hover) and (pointer: fine) {
		.chip:hover {
			color: var(--ink);
		}
	}

	.chip .dot,
	.split-legend .dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
		transition: box-shadow 150ms ease;
	}

	/* ─── Totales del filtro ─── */
	.summary {
		display: flex;
		align-items: center;
		gap: 0;
		min-height: 64px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 24px;
		border-left: 1px solid var(--line);
	}

	.metric:first-child {
		padding-left: 0;
		border-left: 0;
	}

	.m-value {
		font-size: 24px;
		font-weight: 500;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}

	.m-label {
		font-size: 12px;
		color: var(--ink-3);
	}

	.split {
		flex: 1 1 auto;
		min-width: 0;
		gap: 8px;
	}

	.split-bar {
		display: flex;
		gap: 2px;
		height: 6px;
		max-width: 360px;
	}

	.split-bar span {
		flex-basis: 0;
		min-width: 3px;
		border-radius: 2px;
		background: var(--c);
		transition: flex-grow 320ms var(--ease-out);
	}

	.split-legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		font-size: 12px;
		color: var(--ink-2);
	}

	.split-legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.split-legend .num {
		color: var(--ink);
		font-weight: 500;
	}

	.reset {
		margin-left: auto;
		height: 32px;
		font-size: 12px;
	}

	.count {
		display: inline-grid;
		place-items: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--line-2);
		color: var(--ink);
		font-size: 11px;
		font-weight: 600;
	}

	/* ─── Tabla ─── */
	.list {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		transition: opacity 140ms ease;
	}

	.list.dim {
		opacity: 0.55;
	}

	thead th {
		text-align: left;
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-3);
		padding: 0 12px 10px;
		border-bottom: 1px solid var(--line-2);
	}

	td {
		padding: 12px;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}

	thead th:first-child,
	td:first-child {
		padding-left: 0;
	}

	thead th:last-child,
	td:last-child {
		padding-right: 0;
	}

	.r {
		text-align: right;
	}

	/* Cabecera de día: se queda pegada bajo la barra superior al bajar. */
	.day-row th {
		position: sticky;
		top: var(--header-h);
		z-index: 1;
		padding: 18px 0 8px;
		background: var(--bg);
		border-bottom: 1px solid var(--line-2);
		text-align: left;
		font-weight: 400;
	}

	tbody:first-of-type .day-row th {
		padding-top: 14px;
	}

	.day-in {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.day-name {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
	}

	.day-name::first-letter {
		text-transform: uppercase;
	}

	.day-sum {
		display: inline-flex;
		gap: 12px;
		font-size: 12px;
		color: var(--ink-3);
	}

	.strong {
		color: var(--ink);
		font-weight: 500;
	}

	tbody tr:not(.day-row) {
		transition: background-color 150ms ease;
	}

	@media (hover: hover) and (pointer: fine) {
		tbody tr:not(.confirm-row):not(.day-row):hover {
			background: color-mix(in srgb, var(--line) 50%, transparent);
		}
		tbody tr:hover .del {
			opacity: 1;
		}
	}

	tr.sel {
		background: var(--bad-soft);
	}

	tr.sel td {
		border-bottom-color: transparent;
	}

	.who {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin: -3px -6px;
		padding: 3px 6px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		white-space: nowrap;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 150ms ease;
	}

	.who[aria-pressed='true'] {
		background: color-mix(in srgb, var(--c) 14%, transparent);
	}

	@media (hover: hover) and (pointer: fine) {
		.who:hover {
			background: var(--line);
		}
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
	}

	.dot.live {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 30%, transparent);
	}

	.time {
		white-space: nowrap;
		color: var(--ink-2);
	}

	.dur {
		white-space: nowrap;
		font-weight: 500;
	}

	.what {
		width: 100%;
	}

	.title {
		display: block;
		color: var(--ink);
	}

	.title.none {
		color: var(--ink-3);
		font-style: italic;
	}

	.desc {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		max-width: 80ch;
		margin-top: 2px;
		font-size: 12.5px;
		color: var(--ink-3);
	}

	mark {
		background: color-mix(in srgb, var(--warn) 26%, transparent);
		color: var(--ink);
		border-radius: 3px;
		box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--warn) 26%, transparent);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		margin-top: 5px;
	}

	.tags:empty {
		display: none;
	}

	.spec {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin: -2px -5px;
		padding: 2px 5px;
		border: 0;
		border-radius: 5px;
		background: transparent;
		font-size: 11.5px;
		color: var(--ink-3);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.spec::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--sc);
	}

	.spec.on {
		color: var(--ink);
		background: color-mix(in srgb, var(--sc) 14%, transparent);
	}

	@media (hover: hover) and (pointer: fine) {
		.spec:hover {
			color: var(--ink);
			background: var(--line);
		}
	}

	.proj {
		font-size: 11.5px;
		color: var(--ink-3);
	}

	.flag {
		font-size: 11px;
		color: var(--ink-2);
		padding: 0 6px;
		border-radius: 5px;
		border: 1px solid var(--line-2);
	}

	.flag.warn {
		color: var(--warn);
		border-color: color-mix(in srgb, var(--warn) 40%, transparent);
	}

	.flag.live {
		color: var(--live);
		border-color: color-mix(in srgb, var(--live) 40%, transparent);
	}

	.act {
		white-space: nowrap;
		text-align: right;
	}

	.del {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 10px;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: var(--ink-3);
		font-size: 12px;
		cursor: pointer;
		opacity: 0.55;
		transition:
			opacity 150ms ease,
			color 150ms ease,
			border-color 150ms ease,
			transform 140ms var(--ease-out);
	}

	.reviewed {
		font-size: 11px;
		color: var(--ink-3);
	}

	@media (hover: hover) and (pointer: fine) {
		.del.edit:hover {
			color: var(--ink);
			border-color: var(--line-3);
		}
	}

	.del:focus-visible {
		opacity: 1;
	}

	.del:active {
		transform: scale(0.96);
	}

	@media (hover: hover) and (pointer: fine) {
		.del:hover {
			color: var(--bad);
			border-color: color-mix(in srgb, var(--bad) 35%, transparent);
		}
	}

	/* ─── Confirmación ─── */
	.confirm-row td {
		padding: 0 12px 14px 0;
		background: var(--bad-soft);
		border-bottom: 1px solid color-mix(in srgb, var(--bad) 30%, transparent);
	}

	.confirm {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-left: 12px;
		animation: open 200ms var(--ease-out);
	}

	@keyframes open {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	.confirm-q {
		font-size: 13px;
		color: var(--ink-2);
	}

	.confirm-q strong {
		color: var(--ink);
		font-weight: 600;
	}

	.confirm-row-in {
		display: flex;
		gap: 8px;
	}

	.confirm-row-in .input {
		flex: 1 1 auto;
		height: 36px;
	}

	.input.invalid {
		border-color: color-mix(in srgb, var(--bad) 60%, transparent);
	}

	.danger {
		border-color: color-mix(in srgb, var(--bad) 55%, transparent);
		background: var(--bad);
		color: #fff;
		font-weight: 600;
	}

	@media (hover: hover) and (pointer: fine) {
		.danger:hover:not(:disabled) {
			background: color-mix(in srgb, var(--bad) 88%, black);
			border-color: var(--bad);
		}
	}

	.err {
		font-size: 12px;
		color: var(--bad);
	}

	.foot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		font-size: 12px;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		padding: 40px 0;
		color: var(--ink-3);
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

	.skeleton {
		display: flex;
		flex-direction: column;
	}

	.skeleton span {
		height: 46px;
		border-bottom: 1px solid var(--line);
		background: linear-gradient(90deg, transparent, var(--line), transparent) 0 0 / 40% 100% no-repeat;
		animation: sweep 1.2s ease-in-out infinite;
	}

	@keyframes sweep {
		from {
			background-position: -40% 0;
		}
		to {
			background-position: 140% 0;
		}
	}

	/* ─── Registro de eliminadas ─── */
	.log {
		margin-top: 18px;
		padding-top: 20px;
		border-top: 1px solid var(--line);
	}

	.log h2 {
		font-size: 14px;
		margin-bottom: 12px;
	}

	.log ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.log li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
		color: var(--ink-2);
	}

	.log strong {
		color: var(--ink);
		font-weight: 600;
	}

	.log-why {
		color: var(--ink);
	}

	@media (max-width: 1000px) {
		.summary {
			flex-wrap: wrap;
			row-gap: 16px;
		}
		.split {
			flex-basis: 100%;
			padding-left: 0;
			border-left: 0;
		}
		.reset {
			margin-left: 0;
		}
		.dates {
			margin-left: 0;
		}
	}

	@media (max-width: 900px) {
		.c-time,
		.del-label {
			display: none;
		}
	}

	@media (max-width: 640px) {
		.page {
			padding: 20px 16px 40px;
		}
		.f-row {
			grid-template-columns: 1fr;
			gap: 6px;
		}
		.search {
			max-width: none;
		}
		.metric {
			padding: 0 16px;
		}
		.confirm-row-in {
			flex-wrap: wrap;
		}
		.confirm-row-in .input {
			flex-basis: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton span {
			animation: none;
		}
	}
</style>
