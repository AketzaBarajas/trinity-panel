<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '#lib/auth.svelte.ts';
	import Logo from '#lib/components/Logo.svelte';
	import Orb from '#lib/components/Orb.svelte';

	let busy = $state(false);
	let localError = $state<string | null>(null);
	let w = $state(1440);
	let h = $state(900);

	const errorCode = $derived(page.url.searchParams.get('error'));
	const errorText = $derived.by(() => {
		if (localError) return localError;
		if (errorCode === 'not_allowed')
			return 'Esa cuenta de Discord no está en la lista de TRINITY. Si eres del equipo, pide a Ake que añada tu ID.';
		if (errorCode) return 'Discord no completó el inicio de sesión. Vuelve a intentarlo.';
		return null;
	});

	async function signIn() {
		busy = true;
		localError = null;
		const { error } = await auth.signInWithDiscord();
		if (error) {
			busy = false;
			localError = 'No se pudo abrir Discord. Revisa la conexión y vuelve a intentarlo.';
		}
	}

	// Geometría: tres haces (uno por color) desde el borde izquierdo al orbe,
	// y un haz neutro del orbe hacia la columna de acceso.
	const wide = $derived(w > 900);
	const R = $derived(wide ? Math.min(150, h * 0.18) : 96);
	const ox = $derived(wide ? w * 0.36 : w / 2);
	const oy = $derived(wide ? h / 2 : 170);
	const colX = $derived(wide ? w * 0.6 : w / 2);

	const colors = ['var(--m-1FA374)', 'var(--m-3A70F0)', 'var(--m-CB62C2)'];
	const bundles = $derived.by(() =>
		colors.map((color, b) => {
			const y0 = oy + (b - 1) * Math.min(h * 0.28, 230);
			return {
				color,
				paths: Array.from({ length: 9 }, (_, k) => {
					const off = k - 4;
					const sy = y0 + off * 7;
					const a = Math.PI + (b - 1) * 0.42 + off * 0.028;
					const ex = ox + Math.cos(a) * R;
					const ey = oy + Math.sin(a) * R;
					const sx = -20;
					const dx = ex - sx;
					return `M ${sx} ${sy} C ${sx + dx * 0.55} ${sy}, ${ex - dx * 0.4} ${ey}, ${ex} ${ey}`;
				})
			};
		})
	);

	const outPaths = $derived.by(() =>
		Array.from({ length: 11 }, (_, k) => {
			const off = k - 5;
			const a = off * 0.05;
			const x0 = ox + Math.cos(a) * R;
			const y0 = oy + Math.sin(a) * R;
			const tx = colX - 36;
			const ty = oy + off * 2;
			const dx = tx - x0;
			return `M ${x0} ${y0} C ${x0 + dx * 0.5} ${y0}, ${tx - dx * 0.35} ${ty}, ${tx} ${ty}`;
		})
	);
</script>

<svelte:head>
	<title>Entrar · trinity-panel</title>
</svelte:head>

<main class="login" bind:clientWidth={w} bind:clientHeight={h}>
	<svg class="field" width={w} height={h} viewBox="0 0 {w} {h}" aria-hidden="true">
		<defs>
			<filter id="lg-blur" x="-5%" y="-5%" width="110%" height="110%">
				<feGaussianBlur stdDeviation="3" />
			</filter>
		</defs>
		{#if wide}
			<g filter="url(#lg-blur)" opacity="0.45">
				{#each bundles as b, i (i)}
					{#each b.paths as d, k (k)}
						{#if k % 3 === 0}<path {d} style:stroke={b.color} stroke-width="2.5" />{/if}
					{/each}
				{/each}
			</g>
		{/if}
		{#each bundles as b, i (i)}
			{#each b.paths as d, k (k)}
				<path {d} style:stroke={b.color} class="strand" style:stroke-opacity={0.25 + (k % 4) * 0.15} />
				{#if k % 4 === 1}
					<path {d} class="pulse" style:animation-delay="{-(i * 1.3 + k * 0.4)}s" />
				{/if}
			{/each}
		{/each}
		{#if wide}
			{#each outPaths as d, k (k)}
				<path {d} class="out" />
			{/each}
		{/if}
	</svg>

	<div class="orb" style:left="{ox - R}px" style:top="{oy - R}px">
		<Orb
			size={R * 2}
			shares={colors.map((color) => ({ color, weight: 1 }))}
			live
		>
			<Logo size={Math.round(R * 0.36)} />
		</Orb>
	</div>

	<section class="col" style:left={wide ? `${colX}px` : undefined}>
		<div class="brand">
			<Logo size={18} />
			<span>trinity-panel</span>
		</div>

		<h1>Entra y ficha.</h1>
		<p class="lede">El registro de horas del pacto de TRINITY. Solo para los miembros del equipo.</p>

		{#if errorText}
			<div class="alert" role="alert">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.3" /></svg>
				<span>{errorText}</span>
			</div>
		{/if}

		<button type="button" class="btn btn-lg discord" onclick={signIn} disabled={busy}>
			{#if busy}
				<span class="spinner" aria-hidden="true"></span>
				Abriendo Discord…
			{:else}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" /></svg>
				Entrar con Discord
			{/if}
		</button>
		<p class="help">Si tu cuenta no está en la lista, Discord te devolverá aquí.</p>
	</section>
</main>

<style>
	.login {
		position: relative;
		min-height: 100dvh;
		overflow: hidden;
	}

	.field {
		position: absolute;
		inset: 0;
	}

	path {
		fill: none;
		stroke-linecap: round;
	}

	.strand {
		stroke-width: 1;
	}

	.out {
		stroke: var(--strand);
		stroke-width: 1;
	}

	.pulse {
		stroke: var(--ink);
		stroke-opacity: 0.8;
		stroke-width: 1.3;
		stroke-dasharray: 2 40;
		animation: run 3.2s linear infinite;
	}

	@keyframes run {
		to {
			stroke-dashoffset: -168;
		}
	}

	.orb {
		position: absolute;
		animation: appear 900ms var(--ease-out) both;
	}

	.col {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: min(380px, calc(100% - 32px));
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 18px;
		animation: rise 600ms var(--ease-out) 150ms both;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-2);
		margin-bottom: 18px;
	}

	h1 {
		font-size: 44px;
		font-weight: 300;
		font-style: italic;
		letter-spacing: -0.035em;
		line-height: 1;
	}

	.lede {
		font-size: 15px;
		line-height: 1.55;
		color: var(--ink-2);
		max-width: 34ch;
	}

	.discord {
		margin-top: 8px;
		background: var(--discord);
		border-color: var(--discord);
		color: #fff;
		font-weight: 600;
	}

	@media (hover: hover) and (pointer: fine) {
		.discord:hover:not(:disabled) {
			background: color-mix(in srgb, var(--discord) 88%, white);
			border-color: transparent;
		}
	}

	.discord:disabled {
		background: var(--discord);
		color: #fff;
		opacity: 0.75;
	}

	.help {
		font-size: 12px;
		color: var(--ink-3);
	}

	.spinner {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1.5px solid currentColor;
		border-right-color: transparent;
		animation: spin 650ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes appear {
		from {
			opacity: 0;
			transform: scale(0.94);
			filter: blur(6px);
		}
	}

	@keyframes rise {
		from {
			/* 0.01 y no 0: con opacidad 0 Chrome no lo cuenta como pintado y el
			   LCP (velocidad percibida) sale vacío en escritorio. */
			opacity: 0.01;
			transform: translateY(calc(-50% + 10px));
		}
	}

	@media (max-width: 900px) {
		.col {
			position: relative;
			top: auto;
			left: auto;
			transform: none;
			margin: 0 auto;
			padding: 330px 0 48px;
			animation: none;
		}
		h1 {
			font-size: 36px;
		}
	}
</style>
