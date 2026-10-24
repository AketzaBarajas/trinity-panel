<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '#lib/auth.svelte.ts';
	import Logo from '#lib/components/Logo.svelte';

	// Supabase vuelve aquí desde Discord con ?code=… (todo bien) o con un error.
	// Si todo va bien, el layout redirige solo a / o a /bienvenida.
	onMount(() => {
		const query = new URLSearchParams(location.search);
		const hash = new URLSearchParams(location.hash.slice(1));
		const desc = query.get('error_description') ?? hash.get('error_description');
		if (desc) {
			// El trigger de la base de datos rechaza las cuentas fuera de la lista.
			const notAllowed = /trinity_not_allowed|database error saving new user/i.test(desc);
			void goto(`/login?error=${notAllowed ? 'not_allowed' : 'oauth'}`, { replaceState: true });
		}
	});

	$effect(() => {
		if (!auth.loading && !auth.session && !location.search.includes('error')) {
			void goto('/login?error=oauth', { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>Entrando… · trinity-panel</title>
</svelte:head>

<main class="callback" role="status" aria-live="polite">
	<Logo size={48} />
	<p>Entrando…</p>
</main>

<style>
	.callback {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		color: var(--ink-3);
	}
	p {
		margin: 0;
		font-size: 13px;
	}
</style>
