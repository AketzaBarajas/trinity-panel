<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { auth } from '#lib/auth.svelte.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { errorText } from '#lib/stopwatch.svelte.ts';
	import { ago } from '#lib/time.ts';
	import Switch from './Switch.svelte';

	type Kind = 'discord_sessions' | 'discord_weekly' | 'discord_reminder';
	type Send = 'prueba' | 'resumen' | 'recordatorio';

	interface Status {
		configured: boolean;
		set_at: string | null;
		set_by: string | null;
		last: { kind: string; sent_at: string; status: number | null; error: string | null } | null;
	}

	const me = $derived(auth.member!);

	let status = $state<Status | null>(null);
	let toggles = $state<Record<Kind, boolean>>({ discord_sessions: true, discord_weekly: true, discord_reminder: true });
	let missing = $state(false);
	let url = $state('');
	let saving = $state(false);
	let sending = $state<Send | null>(null);
	let urlError = $state<string | null>(null);

	const TOGGLES: { key: Kind; title: string; help: string }[] = [
		{ key: 'discord_sessions', title: 'Inicio y fin de sesiones', help: 'Al llevar 1 minuto en marcha y al describirla.' },
		{ key: 'discord_weekly', title: 'Resumen del domingo', help: 'A las 21:00: horas, objetivo y estado de cada uno.' },
		{ key: 'discord_reminder', title: 'Recordatorio del jueves', help: 'A las 18:00, mención a quien vaya por debajo del 50 %.' }
	];

	const KIND_NAME: Record<string, string> = {
		inicio: 'inicio de sesión',
		fin: 'fin de sesión',
		resumen: 'resumen',
		recordatorio: 'recordatorio',
		prueba: 'prueba'
	};

	async function load() {
		const [s, st] = await Promise.all([
			supabase.rpc('discord_status'),
			supabase.from('app_settings').select('discord_sessions, discord_weekly, discord_reminder').single()
		]);
		if (s.error || st.error) {
			missing = true;
			return;
		}
		missing = false;
		status = s.data as Status;
		toggles = st.data as Record<Kind, boolean>;
	}

	onMount(() => {
		void load();
		// Las respuestas de Discord llegan unos segundos después de mandar.
		const t = setInterval(() => document.visibilityState === 'visible' && void load(), 15000);
		return () => clearInterval(t);
	});

	async function saveUrl(e: SubmitEvent) {
		e.preventDefault();
		if (!url.trim()) {
			urlError = 'Pega la URL del webhook.';
			return;
		}
		urlError = null;
		saving = true;
		const { error } = await supabase.rpc('set_discord_webhook', { p_url: url });
		saving = false;
		if (error) {
			urlError = errorText(error);
			return;
		}
		url = '';
		toast('Discord conectado. Manda una prueba para comprobarlo.', 'ok');
		await load();
	}

	async function disconnect() {
		saving = true;
		const { error } = await supabase.rpc('set_discord_webhook', { p_url: '' });
		saving = false;
		if (error) return void toast(errorText(error), 'bad');
		toast('Discord desconectado: ya no se manda nada.', 'info');
		await load();
	}

	async function toggle(key: Kind, value: boolean) {
		const before = toggles[key];
		toggles[key] = value; // al instante
		const { error } = await supabase.from('app_settings').update({ [key]: value, updated_by: me.id }).eq('id', true);
		if (error) {
			toggles[key] = before;
			toast(errorText(error), 'bad');
		}
	}

	async function send(kind: Send) {
		sending = kind;
		const { error } = await supabase.rpc('discord_send_now', { p_kind: kind });
		sending = null;
		if (error) return void toast(errorText(error), 'bad');
		toast(kind === 'prueba' ? 'Prueba enviada. Mira el canal de Discord.' : `${kind === 'resumen' ? 'Resumen' : 'Recordatorio'} enviado.`, 'ok');
		setTimeout(load, 2500);
	}

	const delivery = $derived.by(() => {
		const l = status?.last;
		if (!l) return null;
		const name = KIND_NAME[l.kind] ?? l.kind;
		if (l.status === null && !l.error) return { tone: 'wait', text: `Enviando ${name}…` };
		if (l.status !== null && l.status >= 200 && l.status < 300)
			return { tone: 'ok', text: `Último aviso (${name}) entregado ${ago(l.sent_at)}` };
		const why =
			l.status === 404 || l.status === 401
				? 'el webhook ya no existe: crea otro y pégalo aquí'
				: l.status === 429
					? 'Discord pide ir más despacio'
					: (l.error ?? `error ${l.status}`);
		return { tone: 'bad', text: `El último aviso (${name}) falló ${ago(l.sent_at)}: ${why}` };
	});
</script>

{#if missing}
	<p class="alert" role="status">Falta ejecutar la migración de la Fase 7 en Supabase (mira el README).</p>
{:else if status}
	<div class="discord">
		<div class="state">
			<span class="dot" class:on={status.configured} aria-hidden="true"></span>
			<span>
				{#if status.configured}
					<strong>Conectado</strong>
					<span class="help"
						>· {status.set_by ? `por ${status.set_by}` : ''}{status.set_at ? ` ${ago(status.set_at)}` : ''}</span
					>
				{:else}
					<strong>Sin conectar</strong>
					<span class="help">· no se manda nada a Discord</span>
				{/if}
			</span>
		</div>

		{#if delivery}
			<p class="delivery {delivery.tone}" aria-live="polite">{delivery.text}</p>
		{/if}

		{#if me.is_owner}
			<form class="hook" onsubmit={saveUrl} novalidate>
				<label class="label" for="hook">{status.configured ? 'Cambiar el webhook' : 'URL del webhook'}</label>
				<div class="hook-row">
					<input
						id="hook"
						class="input mono"
						type="password"
						autocomplete="off"
						spellcheck="false"
						placeholder="https://discord.com/api/webhooks/…"
						bind:value={url}
						aria-invalid={!!urlError}
						aria-describedby="hook-help"
					/>
					<button type="submit" class="btn btn-primary" disabled={saving || !url.trim()}>{saving ? 'Guardando…' : 'Guardar'}</button>
					{#if status.configured}
						<button type="button" class="btn btn-quiet" onclick={disconnect} disabled={saving}>Desconectar</button>
					{/if}
				</div>
				<p id="hook-help" class="help">
					{#if urlError}<span class="err" role="alert">{urlError}</span>{:else}En Discord: ajustes del canal → Integraciones → Webhooks →
						Nuevo webhook → Copiar URL. Se guarda en el servidor y no la ve nadie, ni desde la web.{/if}
				</p>
			</form>
		{:else if !status.configured}
			<p class="help">Lo conecta el admin principal desde aquí.</p>
		{/if}

		<ul class="toggles">
			{#each TOGGLES as t (t.key)}
				<li>
					<span class="t-text">
						<span class="t-title">{t.title}</span>
						<span class="help">{t.help}</span>
					</span>
					<Switch
						checked={toggles[t.key]}
						label={t.title}
						disabled={!me.is_admin}
						onchange={(v) => toggle(t.key, v)}
					/>
				</li>
			{/each}
		</ul>

		{#if me.is_admin && status.configured}
			<div class="send">
				<span class="label">Mandar ahora</span>
				<div class="send-row">
					<button type="button" class="btn" onclick={() => send('prueba')} disabled={!!sending}>
						{sending === 'prueba' ? 'Enviando…' : 'Prueba'}
					</button>
					<button type="button" class="btn" onclick={() => send('resumen')} disabled={!!sending}>
						{sending === 'resumen' ? 'Enviando…' : 'Resumen de esta semana'}
					</button>
					<button type="button" class="btn" onclick={() => send('recordatorio')} disabled={!!sending}>
						{sending === 'recordatorio' ? 'Enviando…' : 'Recordatorio'}
					</button>
				</div>
				<p class="help">Para probar sin esperar al domingo o al jueves. Los automáticos salen igual.</p>
			</div>
		{/if}
	</div>
{:else}
	<p class="help">Cargando…</p>
{/if}

<style>
	.discord {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.state {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ink-4);
	}

	.dot.on {
		background: var(--discord);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--discord) 22%, transparent);
	}

	.delivery {
		margin: -8px 0 0;
		font-size: 12px;
		color: var(--ink-3);
	}

	.delivery.ok::before,
	.delivery.bad::before {
		content: '';
		display: inline-block;
		width: 6px;
		height: 6px;
		margin-right: 8px;
		border-radius: 50%;
		vertical-align: 1px;
		background: var(--go);
	}

	.delivery.bad {
		color: var(--bad);
	}

	.delivery.bad::before {
		background: var(--bad);
	}

	.hook {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.hook-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.hook-row .input {
		flex: 1 1 260px;
		min-width: 0;
		font-size: 12px;
	}

	.err {
		color: var(--bad);
	}

	.toggles {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--bg-raised);
	}

	.toggles li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 14px;
	}

	.toggles li + li {
		border-top: 1px solid var(--line);
	}

	.t-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.t-title {
		font-size: 13px;
		font-weight: 500;
	}

	.send {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.send-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
</style>
