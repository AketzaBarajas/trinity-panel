<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '#lib/auth.svelte.ts';
	import { memberColor, normalizeHex } from '#lib/palette.ts';
	import Logo from '#lib/components/Logo.svelte';
	import Orb from '#lib/components/Orb.svelte';
	import ColorRolePicker from '#lib/components/ColorRolePicker.svelte';

	let selected = $state<string | null>(normalizeHex(auth.member?.color));
	let role = $state(auth.member?.role_label ?? '');

	const c = $derived(selected ? memberColor(selected) : 'var(--strand)');
	// Tu hebra entrando en el orbe: se tiñe al elegir color.
	const strands = Array.from({ length: 7 }, (_, k) => {
		const off = k - 3;
		const y0 = 150 + off * 3;
		const a = Math.PI + off * 0.04;
		const ex = 300 + Math.cos(a) * 80;
		const ey = 150 + Math.sin(a) * 80;
		return `M 150 ${y0} C 185 ${y0}, ${ex - 40} ${ey}, ${ex} ${ey}`;
	});
</script>

<svelte:head>
	<title>Bienvenida · trinity-panel</title>
</svelte:head>

<main class="welcome">
	<section class="visual" aria-hidden="true">
		<svg viewBox="0 0 400 300" class="lines">
			{#each strands as d, k (k)}
				<path {d} style:stroke={c} class:ghost={!selected} style:stroke-opacity={0.35 + (k % 3) * 0.2} />
			{/each}
		</svg>
		<div class="node" style:--c={c}>
			<span class="who">
				<span class="dot"></span>
				<span class="name">{auth.member?.display_name}</span>
			</span>
			<span class="role">{role.trim() || 'sin rol'}</span>
		</div>
		<div class="orb">
			<Orb size={160} shares={selected ? [{ color: c, weight: 1 }] : []}>
				<Logo size={28} />
			</Orb>
		</div>
	</section>

	<section class="form">
		<h1>Hola, {auth.member?.display_name}.</h1>
		<p class="lede">Elige tu color y tu rol. Es lo que verá el resto del equipo en cada gráfica. Puedes cambiarlo luego en Ajustes.</p>
		<ColorRolePicker
			bind:selected
			bind:role
			submitLabel="Entrar al panel"
			onDone={() => goto('/', { replaceState: true })}
		/>
	</section>
</main>

<style>
	.welcome {
		min-height: 100dvh;
		max-width: 1080px;
		margin: 0 auto;
		padding: 48px 28px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 440px);
		align-items: center;
		gap: 56px;
	}

	.visual {
		position: relative;
		aspect-ratio: 4 / 3;
		width: 100%;
		max-width: 520px;
		background: var(--stage-glow);
	}

	.lines {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	path {
		fill: none;
		stroke-width: 1;
		stroke-linecap: round;
		transition: stroke 300ms ease;
	}

	path.ghost {
		stroke: var(--line-2);
		stroke-opacity: 1;
	}

	.node {
		position: absolute;
		left: 0;
		top: 50%;
		width: 37.5%;
		transform: translateY(-50%);
		padding: 10px 12px;
		border-radius: var(--r-sm);
		border: 1px solid var(--line-2);
		background: var(--bg-raised);
		display: flex;
		flex-direction: column;
		gap: 2px;
		transition: border-color 300ms ease;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
		transition: background-color 300ms ease;
	}

	.name {
		font-weight: 600;
	}

	.role {
		font-size: 12px;
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.orb {
		position: absolute;
		left: 75%;
		top: 50%;
		transform: translate(-50%, -50%);
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 14px;
		animation: rise 500ms var(--ease-out) both;
	}

	h1 {
		font-size: 36px;
		font-weight: 300;
		font-style: italic;
		letter-spacing: -0.03em;
	}

	.lede {
		color: var(--ink-2);
		font-size: 14px;
		max-width: 42ch;
		margin-bottom: 14px;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}

	@media (max-width: 860px) {
		.welcome {
			grid-template-columns: minmax(0, 1fr);
			padding: 24px 16px 40px;
			gap: 16px;
		}
		.visual {
			max-width: 360px;
			justify-self: center;
		}
	}
</style>
