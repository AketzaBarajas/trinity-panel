<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { auth } from '#lib/auth.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import { stopwatch, type Draft, type DialogState } from '#lib/stopwatch.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import {
		fmtHM,
		hhmm,
		relDay,
		madridDateISO,
		madridDayStart,
		fromMadridInputs,
		addDaysISO
	} from '#lib/time.ts';

	const TITLE_MAX = 140;
	const DESC_MAX = 2000;
	const MIN = 60_000;

	let dlg = $state<HTMLDialogElement>();
	let titleEl = $state<HTMLInputElement>();
	let formEl = $state<HTMLFormElement>();

	// Formulario
	let title = $state('');
	let description = $state('');
	let specs = $state<string[]>([]);
	let projectId = $state('');
	// Solo horas a mano
	let day = $state('');
	let from = $state('');
	let to = $state('');
	let nearby = $state<{ id: string; started_at: string; ended_at: string | null }[]>([]);

	let saving = $state(false);
	let localError = $state<string | null>(null);
	let confirmDiscard = $state(false);
	let tried = $state(false);
	let openKey: string | null = null;

	const me = $derived(auth.member);
	const view = $derived(stopwatch.dialog);
	// Lo último que se mostró: mantiene el contenido mientras se anima la salida.
	let shown = $state<DialogState>(null);
	const cur = $derived(view ?? shown);
	const manual = $derived(cur?.mode === 'manual');
	const editing = $derived(cur?.mode === 'edit');
	const session = $derived(
		cur?.mode === 'describe' ? team.find(cur.id) : cur?.mode === 'edit' ? (team.find(cur.session.id) ?? cur.session) : undefined
	);
	// Un admin puede editar la de otro: la franja y el color son del dueño.
	const owner = $derived(session ? team.members.find((m) => m.id === session.member_id) : undefined);
	const color = $derived(memberColor((owner ?? me)?.color));
	const othersName = $derived(owner && owner.id !== me?.id ? owner.display_name : null);
	const error = $derived(localError ?? stopwatch.error);

	const draft = (): Draft => ({ title, description, specialties: [...specs], projectId });

	// ─── Abrir / cerrar ───────────────────────────────────────────────────
	$effect(() => {
		const s = view;
		const key = s ? (s.mode === 'manual' ? 'manual' : s.mode === 'edit' ? `edit-${s.session.id}` : s.id) : null;
		if (!dlg) return;
		if (!key) {
			openKey = null;
			if (dlg.open) dlg.close();
			return;
		}
		if (key !== openKey) {
			openKey = key;
			shown = s;
			untrack(() => init(s!));
		}
		if (!dlg.open) {
			dlg.showModal();
			void tick().then(() => titleEl?.focus());
		}
	});

	// Si la sesión desaparece (la descartaron en otro dispositivo), se cierra.
	$effect(() => {
		if (view?.mode === 'describe' && team.loaded && !session) untrack(() => stopwatch.dismiss());
	});

	function init(s: NonNullable<typeof view>) {
		localError = null;
		confirmDiscard = false;
		tried = false;
		saving = false;
		const last = stopwatch.lastSpecialties().filter((x) => team.specialties.some((sp) => sp.slug === x));

		if (s.mode === 'describe' || s.mode === 'edit') {
			const sid = s.mode === 'edit' ? s.session.id : s.id;
			const ses = team.find(sid) ?? (s.mode === 'edit' ? s.session : undefined);
			const d = stopwatch.drafts.get(sid);
			title = d?.title ?? ses?.title ?? '';
			description = d?.description ?? ses?.description ?? '';
			specs = d?.specialties ?? (ses?.specialties.length ? [...ses.specialties] : last);
			projectId = d?.projectId ?? (ses?.project_id || stopwatch.defaultProject());
			return;
		}

		// A mano: por defecto, la última hora (redondeada a 5 min).
		const end = new Date(Math.floor((Date.now() + team.skew) / (5 * MIN)) * 5 * MIN);
		const start = new Date(end.getTime() - 60 * MIN);
		day = madridDateISO(start);
		from = hhmm(start);
		to = hhmm(end);
		title = '';
		description = '';
		specs = last;
		projectId = stopwatch.defaultProject();
		void loadNearby();
	}

	async function loadNearby() {
		if (!me) return;
		const since = new Date(Date.now() + team.skew - 8 * 24 * 60 * MIN).toISOString();
		const { data } = await supabase
			.from('sessions')
			.select('id, started_at, ended_at')
			.eq('member_id', me.id)
			.or(`ended_at.gt.${since},ended_at.is.null`);
		nearby = data ?? [];
	}

	function onClose() {
		// El evento llega un instante tarde: si ya se reabrió (p. ej. tras un error), no es un cierre.
		if (dlg?.open) return;
		// Esc: no se pierde nada, queda pendiente.
		if (stopwatch.dialog) stopwatch.dismiss(manual || editing ? undefined : draft());
	}

	// ─── Rango de tiempo ──────────────────────────────────────────────────
	const range = $derived.by(() => {
		if (session) {
			const a = new Date(session.started_at);
			const b = new Date(session.ended_at ?? team.now);
			return { a, b, nextDay: madridDateISO(a) !== madridDateISO(b) };
		}
		if (!manual) return null;
		const a = fromMadridInputs(day, from);
		let b = fromMadridInputs(day, to);
		if (!a || !b) return null;
		let nextDay = false;
		if (b <= a) {
			b = fromMadridInputs(addDaysISO(day, 1), to);
			nextDay = true;
		}
		return b ? { a, b, nextDay } : null;
	});

	const minutes = $derived(range ? (range.b.getTime() - range.a.getTime()) / MIN : 0);

	const others = $derived.by(() => {
		if (!me) return [];
		const who = session?.member_id ?? me.id;
		const list = manual ? nearby : team.sessions.filter((s) => s.member_id === who && s.id !== session?.id);
		return list.map((s) => ({
			id: s.id,
			a: Date.parse(s.started_at),
			b: s.ended_at ? Date.parse(s.ended_at) : team.now
		}));
	});

	const clash = $derived.by(() => {
		if (!manual || !range) return null;
		const a = range.a.getTime();
		const b = range.b.getTime();
		return others.find((o) => o.a < b && o.b > a) ?? null;
	});

	const today = $derived(madridDateISO(new Date(team.now)));
	const minDay = $derived(addDaysISO(today, -7));

	const rangeError = $derived.by(() => {
		if (!manual) return null;
		if (!range) return 'Pon la hora de inicio y la de fin.';
		const now = Date.now() + team.skew;
		if (range.b.getTime() > now + MIN) return 'El fin no puede estar en el futuro.';
		if (minutes < 1) return 'Tiene que durar al menos 1 minuto.';
		if (minutes > 12 * 60) return 'Como mucho 12 h por sesión. Pártela en dos.';
		if (range.a.getTime() < now - 7 * 24 * 60 * MIN) return 'Solo puedes añadir horas de los últimos 7 días.';
		if (clash) return `Se solapa con tu sesión de ${hhmm(new Date(clash.a))}–${hhmm(new Date(clash.b))}.`;
		return null;
	});

	// ─── Franja del día ───────────────────────────────────────────────────
	const ribbon = $derived.by(() => {
		if (!range) return null;
		const start = madridDayStart(range.a).getTime();
		const end = madridDayStart(new Date(start + 26 * 60 * MIN)).getTime();
		const len = end - start;
		const place = (a: number, b: number) => {
			const lo = Math.max(a, start);
			const hi = Math.min(b, end);
			return hi > lo ? { left: ((lo - start) / len) * 100, width: Math.max(((hi - lo) / len) * 100, 0.4) } : null;
		};
		return {
			self: place(range.a.getTime(), range.b.getTime()),
			others: others
				.map((o) => ({ id: o.id, bad: clash?.id === o.id, pos: place(o.a, o.b) }))
				.filter((o) => o.pos)
		};
	});

	// ─── Validación y guardado ────────────────────────────────────────────
	const titleOk = $derived(title.trim().length > 0 && title.trim().length <= TITLE_MAX);
	const specsOk = $derived(specs.length > 0);
	const canSave = $derived(titleOk && specsOk && !rangeError && !saving);
	const hint = $derived(
		!titleOk ? 'Falta la frase.' : !specsOk ? 'Elige al menos una especialidad.' : (rangeError ?? '')
	);

	function toggle(slug: string) {
		specs = specs.includes(slug) ? specs.filter((x) => x !== slug) : [...specs, slug];
	}

	async function save(e?: SubmitEvent) {
		e?.preventDefault();
		tried = true;
		if (!canSave) return;
		localError = null;

		if (session) {
			const c = stopwatch.dialog;
			await stopwatch.describe(session.id, draft(), c?.mode === 'edit' ? c.session : undefined);
			return;
		}
		if (manual && range) {
			saving = true;
			localError = await stopwatch.addManual(range.a, range.b, draft());
			saving = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			formEl?.requestSubmit();
		}
	}

	const autoCut = $derived(!editing && !!session && session.needs_review && !session.is_manual);
	const cutAt = $derived(session ? new Date(Date.parse(session.started_at) + team.autoCutMinutes * MIN) : null);
	const showProjects = $derived(team.projects.length > 1);
	const projectName = $derived(team.projects.find((p) => p.id === projectId)?.name ?? team.projects[0]?.name);
</script>

<dialog
	bind:this={dlg}
	class="dlg"
	aria-labelledby="dlg-title"
	aria-describedby="dlg-when"
	onclose={onClose}
	style:--c={color}
>
	{#if cur}
		<!-- Ctrl+Enter guarda desde cualquier campo (atajo, no interacción propia del form). -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<form bind:this={formEl} onsubmit={save} onkeydown={onKey} novalidate>
			<header class="head">
				<div class="head-text">
					<h2 id="dlg-title">{manual ? 'Añadir horas a mano' : editing ? 'Editar sesión' : '¿Qué has hecho?'}</h2>
					<p id="dlg-when" class="when">
						{#if range}
							<span class="cap">{relDay(range.a, new Date(team.now))}</span>
							<span class="num">{hhmm(range.a)} → {hhmm(range.b)}</span>
							{#if range.nextDay}<span class="muted">(+1 día)</span>{/if}
						{:else}
							Elige el día y las horas
						{/if}
					</p>
				</div>
				<span class="dur num" class:off={manual && !!rangeError}>{fmtHM(minutes)}</span>
			</header>

			{#if ribbon}
				<div class="ribbon" aria-hidden="true">
					<div class="track">
						{#each ribbon.others as o (o.id)}
							<span class="blk other" class:bad={o.bad} style:left="{o.pos!.left}%" style:width="{o.pos!.width}%"></span>
						{/each}
						{#if ribbon.self}
							<span class="blk self" style:left="{ribbon.self.left}%" style:width="{ribbon.self.width}%"></span>
						{/if}
						{#each [6, 12, 18] as h (h)}
							<i style:left="{(h / 24) * 100}%"></i>
						{/each}
					</div>
					<div class="ticks num"><span>0</span><span>6</span><span>12</span><span>18</span><span>24 h</span></div>
				</div>
			{/if}

			{#if autoCut && cutAt}
				<p class="note">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
					<span>Se paró sola al llegar a {team.autoCutMinutes / 60} h, a las {hhmm(cutAt)}. Cuenta hasta ahí y un admin la revisará.</span>
				</p>
			{/if}

			{#if manual}
				<fieldset class="times">
					<legend class="visually-hidden">Cuándo</legend>
					<label class="f">
						<span class="label">Día</span>
						<input class="input" type="date" bind:value={day} min={minDay} max={today} required />
					</label>
					<label class="f">
						<span class="label">De</span>
						<input class="input num" type="time" bind:value={from} step="300" required />
					</label>
					<label class="f">
						<span class="label">A</span>
						<input class="input num" type="time" bind:value={to} step="300" required />
					</label>
				</fieldset>
			{/if}

			<div class="f">
				<label class="label" for="dlg-phrase">En una frase</label>
				<input
					bind:this={titleEl}
					id="dlg-phrase"
					class="input phrase"
					class:invalid={tried && !titleOk}
					type="text"
					bind:value={title}
					maxlength={TITLE_MAX}
					placeholder="Plantilla de guía de mod terminada"
					autocomplete="off"
					enterkeyhint="done"
					aria-invalid={tried && !titleOk}
				/>
				{#if title.length > TITLE_MAX - 30}
					<span class="help count num">{title.length}/{TITLE_MAX}</span>
				{/if}
			</div>

			<fieldset class="f">
				<legend class="label">Especialidad <span class="muted">· una o varias</span></legend>
				<div class="chips" class:invalid={tried && !specsOk}>
					{#each team.specialties as sp (sp.slug)}
						{@const on = specs.includes(sp.slug)}
						<button
							type="button"
							class="chip"
							class:on
							aria-pressed={on}
							style:--sc={sp.color}
							onclick={() => toggle(sp.slug)}
						>
							<span class="chip-dot" aria-hidden="true"></span>
							{sp.name}
						</button>
					{/each}
				</div>
			</fieldset>

			<div class="f">
				<label class="label" for="dlg-desc">Descripción <span class="muted">· opcional</span></label>
				<textarea
					id="dlg-desc"
					class="input area"
					bind:value={description}
					maxlength={DESC_MAX}
					rows="2"
					placeholder="Detalles, enlaces, lo que quede pendiente…"
				></textarea>
			</div>

			<p class="project help">
				Proyecto:
				{#if showProjects}
					<select class="select" bind:value={projectId} aria-label="Proyecto">
						{#each team.projects as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				{:else}
					<span class="proj-name">{projectName ?? '—'}</span>
				{/if}
				{#if manual}<span class="sep">·</span> Se marcará como manual y la verán todos.{/if}
				{#if editing}<span class="sep">·</span> Las horas no se cambian aquí{othersName ? ` · editas la sesión de ${othersName}` : ''}.{/if}
			</p>

			{#if error}
				<div class="alert" role="alert">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.3" /></svg>
					<span>{error}</span>
				</div>
			{/if}

			<footer class="foot">
				{#if !editing && session && !session.title && !session.is_manual}
					{#if confirmDiscard}
						<span class="confirm" role="group" aria-label="Confirmar descarte">
							<span class="confirm-q">¿Borrarla? No contará.</span>
							<button type="button" class="btn btn-sm danger" onclick={() => stopwatch.discard(session.id)}>Sí, descartar</button>
							<button type="button" class="btn btn-sm btn-quiet" onclick={() => (confirmDiscard = false)}>No</button>
						</span>
					{:else}
						<button type="button" class="btn btn-quiet" onclick={() => (confirmDiscard = true)}>Descartar</button>
					{/if}
				{/if}

				<span class="foot-right">
					{#if tried && hint}
						<span class="hint" role="status">{hint}</span>
					{:else}
						<span class="kbd" aria-hidden="true"><kbd>Ctrl</kbd><kbd>↵</kbd></span>
					{/if}
					<button type="button" class="btn btn-quiet" onclick={() => stopwatch.dismiss(manual || editing ? undefined : draft())}>
						{manual || editing ? 'Cancelar' : 'Más tarde'}
					</button>
					<button type="submit" class="btn btn-primary" aria-disabled={!canSave}>
						{saving ? 'Guardando…' : manual ? 'Añadir' : 'Guardar'}
					</button>
				</span>
			</footer>
		</form>
	{/if}
</dialog>

<style>
	/* ─── Ventana ─── */
	.dlg {
		width: min(560px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		padding: 0;
		border-radius: var(--r-lg);
		border: 1px solid var(--line-2);
		background: var(--bg-raised);
		color: var(--ink);
		box-shadow:
			inset 0 1px 0 var(--slab-edge),
			0 40px 90px -30px rgba(0, 0, 0, 0.7);
		overflow: auto;

		opacity: 0;
		transform: translateY(8px) scale(0.98);
		transition:
			opacity 150ms ease,
			transform 150ms var(--ease-out),
			overlay 150ms allow-discrete,
			display 150ms allow-discrete;
	}

	.dlg[open] {
		opacity: 1;
		transform: none;
		transition-duration: 220ms;
	}

	@starting-style {
		.dlg[open] {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
	}

	.dlg::backdrop {
		background: rgb(0 0 0 / 0);
		transition:
			background-color 200ms ease,
			overlay 200ms allow-discrete,
			display 200ms allow-discrete;
	}

	.dlg[open]::backdrop {
		background: rgb(0 0 0 / 0.6);
	}

	@starting-style {
		.dlg[open]::backdrop {
			background: rgb(0 0 0 / 0);
		}
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 22px 22px 18px;
	}

	/* ─── Cabecera ─── */
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	h2 {
		font-size: 22px;
		font-weight: 300;
		font-style: italic;
		letter-spacing: -0.02em;
	}

	.when {
		display: flex;
		gap: 8px;
		margin-top: 4px;
		font-size: 13px;
		color: var(--ink-2);
	}

	.cap::first-letter {
		text-transform: uppercase;
	}

	.dur {
		font-size: 30px;
		font-weight: 500;
		line-height: 1;
		letter-spacing: -0.04em;
		padding-top: 2px;
		transition: color 150ms ease;
	}

	.dur.off {
		color: var(--ink-3);
	}

	/* ─── Franja del día ─── */
	.ribbon {
		margin-top: -4px;
	}

	.track {
		position: relative;
		height: 10px;
		border-radius: 3px;
		background: var(--bg-sunken);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}

	.track i {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--line-2);
	}

	.blk {
		position: absolute;
		top: 2px;
		bottom: 2px;
		border-radius: 2px;
		transition:
			left 200ms var(--ease-out),
			width 200ms var(--ease-out),
			background-color 150ms ease;
	}

	.blk.self {
		background: var(--c);
		box-shadow: 0 0 8px color-mix(in srgb, var(--c) 55%, transparent);
		z-index: 1;
	}

	.blk.other {
		background: var(--line-3);
	}

	.blk.other.bad {
		background: var(--bad);
	}

	.ticks {
		display: flex;
		justify-content: space-between;
		margin-top: 5px;
		font-size: 10.5px;
		color: var(--ink-3);
	}

	/* ─── Aviso de corte ─── */
	.note {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 10px 12px;
		border-radius: var(--r-sm);
		border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
		background: color-mix(in srgb, var(--warn) 8%, transparent);
		font-size: 13px;
	}

	.note svg {
		flex: 0 0 auto;
		margin-top: 2px;
		color: var(--warn);
	}

	/* ─── Campos ─── */
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}

	.f {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.times {
		display: grid;
		grid-template-columns: 1.4fr 1fr 1fr;
		gap: 10px;
	}

	.phrase {
		height: 46px;
		font-size: 15px;
	}

	.input.invalid {
		border-color: color-mix(in srgb, var(--bad) 60%, transparent);
	}

	.count {
		position: absolute;
		right: 0;
		top: 0;
	}

	.area {
		height: auto;
		min-height: 64px;
		padding: 10px 12px;
		line-height: 1.5;
		resize: vertical;
		field-sizing: content;
		max-height: 220px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 2px;
		margin: -2px;
		border-radius: var(--r-sm);
	}

	.chips.invalid {
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--bad) 55%, transparent);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 30px;
		padding: 0 12px 0 10px;
		border-radius: 999px;
		border: 1px solid var(--line-2);
		background: transparent;
		color: var(--ink-2);
		font-size: 12.5px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			transform 120ms var(--ease-out),
			border-color 150ms ease,
			background-color 150ms ease,
			color 150ms ease;
	}

	.chip:active {
		transform: scale(0.96);
	}

	.chip-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--sc);
		opacity: 0.55;
		transition:
			opacity 150ms ease,
			transform 180ms var(--ease-out);
	}

	.chip.on {
		color: var(--ink);
		border-color: color-mix(in srgb, var(--sc) 65%, transparent);
		background: color-mix(in srgb, var(--sc) 12%, transparent);
	}

	.chip.on .chip-dot {
		opacity: 1;
		transform: scale(1.15);
	}

	@media (hover: hover) and (pointer: fine) {
		.chip:hover:not(.on) {
			border-color: var(--line-3);
			color: var(--ink);
		}
	}

	.project {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		margin-top: -4px;
	}

	.proj-name {
		color: var(--ink-2);
	}

	.sep {
		color: var(--ink-4);
	}

	.select {
		height: 28px;
		padding: 0 8px;
		border-radius: 6px;
		border: 1px solid var(--line-2);
		background: var(--bg-sunken);
		color: var(--ink);
		font: inherit;
	}

	/* ─── Pie ─── */
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 16px;
		margin-top: 2px;
		border-top: 1px solid var(--line);
	}

	.foot-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.hint {
		font-size: 12px;
		color: var(--bad);
		margin-right: 4px;
		animation: hint-in 180ms var(--ease-out);
	}

	@keyframes hint-in {
		from {
			opacity: 0;
			transform: translateX(4px);
		}
	}

	.kbd {
		display: inline-flex;
		gap: 3px;
		margin-right: 4px;
	}

	kbd {
		font: 500 10.5px var(--font-sans);
		color: var(--ink-3);
		padding: 2px 5px;
		border-radius: 4px;
		border: 1px solid var(--line-2);
		border-bottom-width: 2px;
	}

	.btn[aria-disabled='true'] {
		opacity: 0.55;
	}

	.btn-sm {
		height: 30px;
		padding: 0 10px;
		font-size: 12.5px;
	}

	.confirm {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		animation: hint-in 180ms var(--ease-out);
	}

	.confirm-q {
		font-size: 12.5px;
		color: var(--ink-2);
		margin-right: 2px;
	}

	.danger {
		border-color: color-mix(in srgb, var(--bad) 45%, transparent);
		background: var(--bad-soft);
		color: var(--bad);
	}

	@media (max-width: 560px) {
		.times {
			grid-template-columns: 1fr 1fr;
		}
		.times .f:first-child {
			grid-column: 1 / -1;
		}
		.kbd {
			display: none;
		}
		.foot {
			flex-wrap: wrap;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dlg,
		.dlg[open] {
			transform: none;
		}
	}
</style>
