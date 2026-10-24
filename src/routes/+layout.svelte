<script lang="ts">
	import '@fontsource-variable/inter';
	import '@fontsource-variable/jetbrains-mono';
	import '../app.css';

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { auth } from '#lib/auth.svelte.ts';
	import { theme } from '#lib/theme.svelte.ts';
	import { pwa } from '#lib/pwa.svelte.ts';
	import { DEMO } from '#lib/supabase.ts';
	import Logo from '#lib/components/Logo.svelte';
	import Toaster from '#lib/components/Toaster.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		theme.init();
		void auth.start();
		void pwa.init();
	});

	const isPublic = (p: string) => p === '/login' || p.startsWith('/auth/');

	// A dónde hay que mandar al usuario (null = puede quedarse aquí).
	const target = $derived.by(() => {
		if (auth.loading) return null;
		const p = page.url.pathname;
		if (!auth.session) return isPublic(p) ? null : '/login';
		if (!auth.member) return null; // lo resuelve el efecto de abajo
		if (!auth.member.onboarded_at) return p === '/bienvenida' ? null : '/bienvenida';
		if (isPublic(p) || p === '/bienvenida') return '/';
		return null;
	});

	$effect(() => {
		if (target) void goto(target, { replaceState: true });
	});

	// Sesión válida pero sin ficha de miembro: no está en la lista cerrada.
	$effect(() => {
		if (!auth.loading && auth.session && !auth.member) {
			void auth.signOut().then(() => goto('/login?error=not_allowed', { replaceState: true }));
		}
	});

	const ready = $derived(
		!auth.loading && !target && !(auth.session && !auth.member)
	);
</script>

{#if ready}
	{@render children()}
	<Toaster />
	{#if DEMO}
		<span class="demo-badge">Demo · datos inventados</span>
	{/if}
{:else}
	<div class="splash" role="status" aria-live="polite">
		<Logo size={32} />
		<span class="visually-hidden">Cargando trinity-panel…</span>
	</div>
{/if}

<style>
	.demo-badge {
		position: fixed;
		left: 50%;
		top: 16px;
		transform: translateX(-50%);
		z-index: 70;
		padding: 4px 10px;
		border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--warn) 12%, var(--bg));
		color: var(--warn);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.02em;
		pointer-events: none;
	}

	.splash {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Solo aparece si la carga tarda: evita el parpadeo en cargas rápidas. */
		animation: splash-in 300ms var(--ease-out) 180ms both;
	}

	.splash :global(.logo) {
		animation: breathe 1.4s ease-in-out infinite;
	}

	@keyframes splash-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
	}

	@keyframes breathe {
		50% {
			opacity: 0.35;
		}
	}
</style>
