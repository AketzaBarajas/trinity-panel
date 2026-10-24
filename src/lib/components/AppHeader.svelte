<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { auth } from '#lib/auth.svelte.ts';
	import { theme } from '#lib/theme.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import { stopwatch } from '#lib/stopwatch.svelte.ts';
	import { pact } from '#lib/pact.svelte.ts';
	import { memberColor, initial } from '#lib/palette.ts';
	import { fmtClock, hhmm } from '#lib/time.ts';
	import Logo from './Logo.svelte';
	import SessionDialog from './SessionDialog.svelte';

	onMount(() => team.use());
	onMount(() => pact.use());

	const links = [
		{ href: '/', label: 'Panel' },
		{ href: '/sesiones', label: 'Sesiones' },
		{ href: '/pacto', label: 'Pacto' },
		{ href: '/ajustes', label: 'Ajustes' }
	];

	const me = $derived(auth.member!);
	const mine = $derived(stopwatch.mine);
	const startMs = $derived(mine ? Date.parse(mine.started_at) : 0);
	const elapsed = $derived(mine ? Math.max(0, (team.now - startMs) / 1000) : 0);
	const cutS = $derived(team.autoCutMinutes * 60);
	const nearCut = $derived(!!mine && elapsed >= cutS - 15 * 60);
	const progress = $derived(mine ? Math.min(elapsed / cutS, 1) : 0);
	const pendingCount = $derived(mine ? 0 : team.undescribed.length);
	const toReview = $derived(pact.reviewable.length);

	const tip = $derived(
		mine
			? `Empezaste a las ${hhmm(new Date(startMs))}. Se para sola a las ${hhmm(new Date(startMs + cutS * 1000))}.`
			: 'Empieza a contar tu tiempo. Se guarda en el servidor: puedes cerrar la pestaña.'
	);

	function toggleWatch() {
		if (mine) void stopwatch.stop();
		else void stopwatch.start();
	}

	// Abre la ventana sola para lo que quedó sin describir (una vez por sesión).
	$effect(() => {
		if (!team.loaded || stopwatch.dialog) return;
		const next = team.undescribed.find((s) => !stopwatch.isDismissed(s.id));
		if (next) stopwatch.openDescribe(next.id);
	});
</script>

<header class="bar">
	<div class="inner">
		<a class="brand" href="/" aria-label="trinity-panel, ir al panel">
			<Logo />
			<span class="brand-name">trinity-panel</span>
		</a>

		<nav aria-label="Principal">
			{#each links as l (l.href)}
				<a href={l.href} aria-current={page.url.pathname === l.href ? 'page' : undefined}>
					{l.label}
					{#if l.href === '/pacto' && toReview}
						<span class="badge num" title="{toReview} {toReview === 1 ? 'sesión' : 'sesiones'} por validar">{toReview}<span class="visually-hidden"> por validar</span></span>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="right">
			{#if pendingCount}
				<button type="button" class="pending" onclick={() => stopwatch.openPending()}>
					<span class="pending-dot" aria-hidden="true"></span>
					<span class="pending-label">{pendingCount === 1 ? 'Describe tu sesión' : `${pendingCount} sesiones sin describir`}</span>
				</button>
			{/if}

			<div class="watch" class:running={!!mine} class:near={nearCut} role="group" aria-label="Tu cronómetro" title={tip}>
				<span class="watch-dot" aria-hidden="true"></span>
				<span class="watch-time mono" aria-hidden="true">{fmtClock(elapsed)}</span>
				{#if mine}
					<span class="watch-since">desde {hhmm(new Date(startMs))}</span>
				{/if}
				<button
					type="button"
					class="watch-btn"
					class:stop={!!mine}
					onclick={toggleWatch}
					disabled={stopwatch.busy && !mine}
					aria-label={mine ? `Parar cronómetro (${fmtClock(elapsed)})` : 'Iniciar cronómetro'}
				>
					<span class="face" class:shown={!mine} aria-hidden="true">
						<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1.2v7.6L8.6 5z" fill="currentColor" /></svg>
						<span class="watch-label">Iniciar</span>
					</span>
					<span class="face" class:shown={!!mine} aria-hidden="true">
						<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" /></svg>
						<span class="watch-label">Parar</span>
					</span>
				</button>
				<span class="watch-progress" aria-hidden="true" style:transform="scaleX({progress})"></span>
			</div>
			<span class="visually-hidden" role="status">{mine ? 'Cronómetro en marcha' : ''}</span>

			<button
				type="button"
				class="btn btn-quiet btn-icon"
				onclick={() => theme.toggle()}
				aria-label={theme.current === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
			>
				{#if theme.current === 'dark'}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" /></svg>
				{:else}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></svg>
				{/if}
			</button>

			<a class="avatar" href="/ajustes" aria-label="Tu cuenta: {me.display_name}" style:--c={memberColor(me.color)}>
				{#if me.avatar_url}
					<img src={me.avatar_url} alt="" width="30" height="30" referrerpolicy="no-referrer" />
				{:else}
					{initial(me.display_name)}
				{/if}
			</a>
		</div>
	</div>
</header>

<SessionDialog />

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 10;
		height: var(--header-h);
		border-bottom: 1px solid var(--line);
		background: var(--bg);
	}

	.inner {
		max-width: 1440px;
		height: 100%;
		margin: 0 auto;
		padding: 0 28px;
		display: flex;
		align-items: center;
		gap: 28px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
	}

	.brand-name {
		font-weight: 600;
		font-size: 14px;
		letter-spacing: -0.01em;
	}

	nav {
		display: flex;
		align-self: stretch;
		gap: 22px;
	}

	nav a {
		position: relative;
		display: flex;
		align-items: center;
		font-size: 13px;
		color: var(--ink-3);
		text-decoration: none;
		transition: color 150ms ease;
	}

	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 16px;
		height: 16px;
		margin-left: 6px;
		padding: 0 4px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
		font-size: 10.5px;
		font-weight: 600;
		line-height: 1;
	}

	nav a[aria-current='page'] {
		color: var(--ink);
	}

	nav a[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 1px;
		background: var(--ink);
	}

	@media (hover: hover) and (pointer: fine) {
		nav a:hover {
			color: var(--ink);
		}
	}

	.right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/* ─── Pendiente de describir ─── */
	.pending {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
		background: color-mix(in srgb, var(--warn) 8%, transparent);
		color: var(--ink);
		font-size: 12.5px;
		cursor: pointer;
		transition:
			transform 140ms var(--ease-out),
			background-color 150ms ease;
		animation: pop-in 240ms var(--ease-out);
	}

	.pending:active {
		transform: scale(0.97);
	}

	@media (hover: hover) and (pointer: fine) {
		.pending:hover {
			background: color-mix(in srgb, var(--warn) 14%, transparent);
		}
	}

	.pending-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--warn);
	}

	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateX(6px) scale(0.97);
		}
	}

	/* ─── Cronómetro ─── */
	.watch {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		height: 40px;
		padding: 0 4px 0 14px;
		margin-right: 8px;
		border-radius: 999px;
		border: 1px solid var(--line-2);
		background: var(--bg-raised);
		overflow: hidden;
		transition: border-color 200ms ease;
	}

	.watch.running {
		border-color: color-mix(in srgb, var(--live) 35%, var(--line-2));
	}

	.watch.near {
		border-color: color-mix(in srgb, var(--warn) 45%, var(--line-2));
	}

	.watch-dot {
		width: 6px;
		height: 6px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--ink-4);
		transition: background-color 200ms ease;
	}

	.running .watch-dot {
		background: var(--live);
		animation: live 2s ease-in-out infinite;
	}

	.near .watch-dot {
		background: var(--warn);
	}

	@keyframes live {
		0%,
		100% {
			box-shadow: 0 0 0 0 var(--live-glow);
		}
		50% {
			box-shadow: 0 0 0 4px transparent;
		}
	}

	.watch-time {
		font-size: 15px;
		font-weight: 500;
		color: var(--ink-2);
		min-width: 74px;
		transition: color 200ms ease;
	}

	.running .watch-time {
		color: var(--ink);
	}

	.near .watch-time {
		color: var(--warn);
	}

	.watch-since {
		font-size: 12px;
		color: var(--ink-3);
		margin-left: -4px;
		white-space: nowrap;
		animation: since-in 260ms var(--ease-out);
	}

	@keyframes since-in {
		from {
			opacity: 0;
			transform: translateX(-4px);
			filter: blur(2px);
		}
	}

	/* Progreso hacia el corte automático: 1 px en el borde inferior. */
	.watch-progress {
		position: absolute;
		left: 14px;
		right: 14px;
		bottom: 0;
		height: 1px;
		background: var(--live);
		opacity: 0;
		transform-origin: left center;
		transition:
			transform 1s linear,
			opacity 300ms ease,
			background-color 200ms ease;
	}

	.running .watch-progress {
		opacity: 0.55;
	}

	.near .watch-progress {
		background: var(--warn);
		opacity: 0.9;
	}

	.watch-btn {
		display: inline-grid;
		height: 32px;
		padding: 0 14px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: var(--go);
		color: var(--go-ink);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			transform 140ms var(--ease-out),
			background-color 200ms ease,
			border-color 200ms ease,
			color 200ms ease;
	}

	.watch-btn.stop {
		background: var(--bg);
		border-color: var(--line-3);
		color: var(--ink);
	}

	@media (hover: hover) and (pointer: fine) {
		.watch-btn:hover:not(:disabled):not(.stop) {
			background: color-mix(in srgb, var(--go) 88%, white);
		}
		.watch-btn.stop:hover {
			border-color: var(--ink-3);
		}
	}

	.watch-btn:active:not(:disabled) {
		transform: scale(0.96);
	}

	.watch-btn:disabled {
		cursor: progress;
	}

	/* Las dos caras ocupan la misma celda: el botón no cambia de ancho. */
	.face {
		grid-area: 1 / 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		opacity: 0;
		filter: blur(3px);
		transform: scale(0.9);
		transition:
			opacity 160ms ease,
			filter 160ms ease,
			transform 200ms var(--ease-out);
	}

	.face.shown {
		opacity: 1;
		filter: none;
		transform: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.running .watch-dot {
			animation: none;
			box-shadow: 0 0 0 3px var(--live-soft);
		}
		.face {
			filter: none;
			transform: none;
		}
	}

	@media (max-width: 960px) {
		.watch-since,
		.pending-label {
			display: none;
		}
		.pending {
			width: 32px;
			padding: 0;
			justify-content: center;
		}
	}

	/* ─── Avatar ─── */
	.avatar {
		width: 30px;
		height: 30px;
		margin-left: 4px;
		border-radius: 50%;
		box-shadow:
			0 0 0 1.5px var(--bg),
			0 0 0 3px var(--c);
		background: color-mix(in srgb, var(--c) 18%, var(--bg-raised));
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
		transition: transform 140ms var(--ease-out);
	}

	.avatar:active {
		transform: scale(0.95);
	}

	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	@media (max-width: 720px) {
		.inner {
			padding: 0 16px;
			gap: 12px;
		}
		.brand-name {
			display: none;
		}
		nav {
			gap: 14px;
		}
		.right {
			gap: 4px;
		}
		.watch {
			margin-right: 0;
			gap: 6px;
			padding-left: 8px;
		}
		.watch-label {
			display: none;
		}
		.watch-btn {
			width: 32px;
			padding: 0;
			justify-content: center;
		}
		.watch-progress {
			left: 8px;
			right: 8px;
		}
	}
</style>
