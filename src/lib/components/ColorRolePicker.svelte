<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { auth } from '#lib/auth.svelte.ts';
	import { memberColor, normalizeHex } from '#lib/palette.ts';
	import type { MemberColor } from '#lib/types.ts';

	let {
		submitLabel,
		onDone,
		selected = $bindable(normalizeHex(auth.member?.color)),
		role = $bindable(auth.member?.role_label ?? '')
	}: {
		submitLabel: string;
		onDone?: () => void;
		selected?: string | null;
		role?: string;
	} = $props();

	const me = $derived(auth.member!);

	let colors = $state<MemberColor[]>([]);
	let others = $state<{ id: string; display_name: string; color: string | null }[]>([]);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let saved = $state(false);

	const ROLE_MAX = 32;
	const takenBy = (hex: string) => others.find((m) => m.color === hex)?.display_name ?? null;
	const dirty = $derived(
		selected !== normalizeHex(auth.member?.color) || role.trim() !== (auth.member?.role_label ?? '')
	);
	const canSave = $derived(!!selected && !saving && (dirty || !auth.member?.onboarded_at));

	async function loadOthers() {
		const { data } = await supabase.from('members').select('id, display_name, color').neq('id', me.id);
		others = (data ?? []).map((m) => ({ ...m, color: normalizeHex(m.color) }));
		if (selected && takenBy(selected)) selected = null;
	}

	onMount(() => {
		void (async () => {
			const { data } = await supabase.from('member_colors').select('*').order('sort');
			colors = (data as MemberColor[] | null) ?? [];
			await loadOthers();
			if (selected && !colors.some((c) => c.hex === selected)) selected = null;
		})();

		const channel = supabase
			.channel('picker-members')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => void loadOthers())
			.subscribe();
		return () => void supabase.removeChannel(channel);
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!selected) return;
		saving = true;
		error = null;
		saved = false;

		const { error: err } = await supabase
			.from('members')
			.update({
				color: selected,
				role_label: role.trim() || null,
				onboarded_at: auth.member?.onboarded_at ?? new Date().toISOString()
			})
			.eq('id', me.id);

		saving = false;
		if (err) {
			if (err.code === '23505') {
				error = 'Alguien acaba de coger ese color. Elige otro.';
				await loadOthers();
			} else if (err.code === '23503') {
				error = 'Ese color ya no existe. Recarga la página.';
			} else {
				error = 'No se ha podido guardar. Vuelve a intentarlo.';
				console.error('[perfil]', err);
			}
			return;
		}

		await auth.loadMember();
		saved = true;
		onDone?.();
	}
</script>

<form class="picker" onsubmit={save}>
	<fieldset>
		<legend class="label">Color</legend>
		<p class="help">Te identifica en todas las gráficas. Los que ya tiene otro no se pueden elegir.</p>
		<div class="swatches">
			{#each colors as c (c.hex)}
				{@const owner = takenBy(c.hex)}
				<label class="swatch" class:taken={!!owner} style:--c={memberColor(c.hex)}>
					<input type="radio" name="color" value={c.hex} bind:group={selected} disabled={!!owner} class="visually-hidden" />
					<span class="chip" aria-hidden="true">
						<svg width="12" height="12" viewBox="0 0 12 12" class="check"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
					</span>
					<span class="sw-name">{c.name}</span>
					<span class="sw-sub">{owner ?? ' '}</span>
				</label>
			{:else}
				{#each [0, 1, 2, 3] as i (i)}
					<span class="swatch ghost" aria-hidden="true"><span class="chip"></span></span>
				{/each}
			{/each}
		</div>
	</fieldset>

	<div class="field">
		<label class="label" for="role">Rol <span class="muted">· opcional</span></label>
		<input id="role" class="input" type="text" bind:value={role} maxlength={ROLE_MAX} placeholder="web, guías, vídeo…" autocomplete="off" />
		<p class="help">Sale junto a tu nombre. {role.length}/{ROLE_MAX}</p>
	</div>

	{#if error}
		<div class="alert" role="alert">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.3" /></svg>
			<span>{error}</span>
		</div>
	{/if}

	<div class="actions">
		<button type="submit" class="btn btn-primary" disabled={!canSave}>
			{saving ? 'Guardando…' : submitLabel}
		</button>
		{#if saved && !dirty}
			<span class="saved" role="status">Guardado</span>
		{/if}
	</div>
</form>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 26px;
	}

	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.swatch {
		width: 84px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 12px 4px 8px;
		border-radius: var(--r);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: background-color 150ms ease;
	}

	@media (hover: hover) and (pointer: fine) {
		.swatch:hover:not(.taken) {
			background: var(--line);
		}
	}

	.chip {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--c, var(--line-2));
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 3px transparent;
		transition:
			box-shadow 180ms var(--ease-out),
			transform 160ms var(--ease-out);
	}

	.swatch:active:not(.taken) .chip {
		transform: scale(0.94);
	}

	.check {
		opacity: 0;
		transform: scale(0.6);
		transition:
			opacity 160ms ease,
			transform 200ms var(--ease-out);
	}

	.swatch:has(input:checked) .chip {
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 3.5px var(--c);
	}

	.swatch:has(input:checked) .check {
		opacity: 1;
		transform: scale(1);
	}

	.swatch:has(input:focus-visible) {
		outline: 1.5px solid var(--live);
		outline-offset: 0;
	}

	.taken {
		cursor: not-allowed;
	}

	.taken .chip {
		background: repeating-linear-gradient(135deg, var(--c) 0 2px, transparent 2px 5px);
		box-shadow: inset 0 0 0 1px var(--c);
		opacity: 0.6;
	}

	.sw-name {
		font-size: 12px;
		font-weight: 500;
		color: var(--ink);
	}

	.taken .sw-name {
		color: var(--ink-3);
	}

	.sw-sub {
		font-size: 11px;
		color: var(--ink-3);
		min-height: 14px;
		white-space: pre;
	}

	.ghost .chip {
		animation: shimmer 1.1s ease-in-out infinite;
	}

	@keyframes shimmer {
		50% {
			opacity: 0.4;
		}
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.saved {
		font-size: 13px;
		color: var(--ink-2);
		animation: in 220ms var(--ease-out);
	}

	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(3px);
		}
	}
</style>
