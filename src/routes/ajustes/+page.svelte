<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { auth } from '#lib/auth.svelte.ts';
	import { team } from '#lib/team.svelte.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { fmtHuman } from '#lib/time.ts';
	import { memberColor, initial } from '#lib/palette.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import ColorRolePicker from '#lib/components/ColorRolePicker.svelte';
	import DiscordSettings from '#lib/components/DiscordSettings.svelte';
	import BackupSettings from '#lib/components/BackupSettings.svelte';
	import { pwa } from '#lib/pwa.svelte.ts';

	let installing = $state(false);
	async function install() {
		installing = true;
		await pwa.install();
		installing = false;
	}

	const me = $derived(auth.member!);
	let leaving = $state(false);

	// ─── Objetivo personal (además del mínimo del pacto) ───
	const toHours = (m: number | null) => (m ? String(Math.round((m / 60) * 4) / 4).replace('.', ',') : '');
	let goalText = $state(untrack(() => toHours(me.weekly_goal_minutes)));
	let savingGoal = $state(false);
	let goalError = $state<string | null>(null);

	const parsed = $derived.by(() => {
		const t = goalText.trim().replace(',', '.');
		if (!t) return { ok: true, minutes: null as number | null };
		const h = Number(t);
		if (!Number.isFinite(h) || h < 0 || h > 100) return { ok: false, minutes: null };
		return { ok: true, minutes: Math.round(h * 60) || null };
	});
	const goalDirty = $derived(parsed.ok && parsed.minutes !== (me.weekly_goal_minutes ?? null));

	async function saveGoal(e: SubmitEvent) {
		e.preventDefault();
		if (!parsed.ok) {
			goalError = 'Escribe las horas con un número entre 0 y 100 (p. ej. 6 o 5,5).';
			return;
		}
		goalError = null;
		savingGoal = true;
		const { error } = await supabase.from('members').update({ weekly_goal_minutes: parsed.minutes }).eq('id', me.id);
		savingGoal = false;
		if (error) {
			goalError = 'No se ha podido guardar. Vuelve a intentarlo.';
			return;
		}
		await auth.loadMember();
		goalText = toHours(parsed.minutes);
		toast(parsed.minutes ? `Objetivo guardado: ${fmtHuman(parsed.minutes)} a la semana` : 'Objetivo quitado', 'ok');
	}

	async function signOut() {
		leaving = true;
		await auth.signOut();
		await goto('/login', { replaceState: true });
	}
</script>

<svelte:head>
	<title>Ajustes · trinity-panel</title>
</svelte:head>

<AppHeader />

<main class="page">
	<h1>Ajustes</h1>

	<section class="row" aria-labelledby="perfil">
		<div class="side">
			<h2 id="perfil">Perfil</h2>
			<p class="help">Cómo te ven los demás en el panel.</p>
		</div>
		<div class="body">
			<ColorRolePicker submitLabel="Guardar cambios" />
		</div>
	</section>

	<section class="row" aria-labelledby="objetivo">
		<div class="side">
			<h2 id="objetivo">Objetivo semanal</h2>
			<p class="help">Tu meta personal. No cambia el mínimo del pacto ({fmtHuman(team.minMinutes)}); se marca en tu barra de “Tu semana”.</p>
		</div>
		<form class="body goal" onsubmit={saveGoal} novalidate>
			<label class="goal-field">
				<span class="visually-hidden">Horas por semana</span>
				<input
					class="input num"
					class:invalid={!parsed.ok}
					type="text"
					inputmode="decimal"
					bind:value={goalText}
					placeholder="Sin objetivo"
					maxlength="5"
					aria-invalid={!parsed.ok}
					aria-describedby="goal-help"
				/>
				<span class="unit">h / semana</span>
			</label>
			<button type="submit" class="btn" disabled={!goalDirty || savingGoal}>{savingGoal ? 'Guardando…' : 'Guardar'}</button>
			<p id="goal-help" class="help full">
				{#if goalError}<span class="err" role="alert">{goalError}</span>{:else}Vacío = sin objetivo. Admite medias horas: 5,5.{/if}
			</p>
		</form>
	</section>

	<section class="row" aria-labelledby="app">
		<div class="side">
			<h2 id="app">App</h2>
			<p class="help">Instálala en el ordenador: ventana propia, icono en la barra de tareas y arranque al instante.</p>
		</div>
		<div class="body app">
			{#if pwa.standalone}
				<p class="app-state"><span class="ok-dot" aria-hidden="true"></span>Estás usando la app instalada.</p>
			{:else if pwa.canInstall}
				<button type="button" class="btn btn-primary" onclick={install} disabled={installing}>
					{installing ? 'Instalando…' : 'Instalar en este ordenador'}
				</button>
			{:else}
				<p class="help">
					En Chrome o Edge: pulsa el icono de instalar a la derecha de la barra de direcciones (o menú ⋮ → <em>Instalar
						trinity-panel</em>). Si no aparece, ya la tienes instalada o el navegador no lo permite (Firefox).
				</p>
			{/if}
			{#if pwa.updateReady}
				<button type="button" class="btn" onclick={() => pwa.update()}>Cargar la versión nueva</button>
			{/if}
		</div>
	</section>

	<section class="row" aria-labelledby="discord">
		<div class="side">
			<h2 id="discord">Discord</h2>
			<p class="help">Avisos en el canal del equipo. {me.is_admin ? 'Los admins eligen cuáles.' : 'Los eligen los admins.'}</p>
		</div>
		<div class="body">
			<DiscordSettings />
		</div>
	</section>

	{#if me.is_admin}
		<section class="row" aria-labelledby="copias">
			<div class="side">
				<h2 id="copias">Copias de seguridad</h2>
				<p class="help">
					Cada lunes de madrugada se guarda una foto de todo (sesiones, ausencias, ajustes…). Descárgala en JSON para tenerla también
					en tu PC.
				</p>
			</div>
			<div class="body">
				<BackupSettings />
			</div>
		</section>
	{/if}

	<section class="row" aria-labelledby="cuenta">
		<div class="side">
			<h2 id="cuenta">Cuenta</h2>
			<p class="help">Entras con Discord; aquí no hay contraseña.</p>
		</div>
		<div class="body account">
			<div class="who" style:--c={memberColor(me.color)}>
				<span class="avatar">
					{#if me.avatar_url}
						<img src={me.avatar_url} alt="" width="40" height="40" referrerpolicy="no-referrer" />
					{:else}
						{initial(me.display_name)}
					{/if}
				</span>
				<span class="who-text">
					<span class="name">{me.display_name}</span>
					<span class="help">{me.is_owner ? 'Admin principal' : me.is_admin ? 'Admin' : 'Miembro'} · Discord</span>
				</span>
			</div>
			<button type="button" class="btn" onclick={signOut} disabled={leaving}>
				{leaving ? 'Cerrando sesión…' : 'Cerrar sesión'}
			</button>
		</div>
	</section>
</main>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: 36px 28px 64px;
	}

	h1 {
		font-size: 30px;
		font-weight: 300;
		font-style: italic;
		letter-spacing: -0.025em;
		margin-bottom: 28px;
	}

	.row {
		display: grid;
		grid-template-columns: 240px minmax(0, 1fr);
		gap: 40px;
		padding: 32px 0;
		border-top: 1px solid var(--line);
	}

	h2 {
		font-size: 14px;
		margin-bottom: 4px;
	}

	.goal {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.goal-field {
		position: relative;
		display: flex;
		align-items: center;
		width: 200px;
	}

	.goal-field .input {
		padding-right: 92px;
	}

	.goal-field .input.invalid {
		border-color: color-mix(in srgb, var(--bad) 60%, transparent);
	}

	.unit {
		position: absolute;
		right: 12px;
		font-size: 12px;
		color: var(--ink-3);
		pointer-events: none;
	}

	.full {
		flex-basis: 100%;
	}

	.err {
		color: var(--bad);
	}

	.app {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}

	.app-state {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		font-size: 14px;
	}

	.ok-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--go);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--go) 22%, transparent);
	}

	.account {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		background: color-mix(in srgb, var(--c) 18%, var(--bg-raised));
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 3.5px var(--c);
	}

	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.who-text {
		display: flex;
		flex-direction: column;
	}

	.name {
		font-weight: 600;
		font-size: 14px;
	}

	@media (max-width: 720px) {
		.page {
			padding: 24px 16px 48px;
		}
		.row {
			grid-template-columns: minmax(0, 1fr);
			gap: 16px;
		}
	}
</style>
