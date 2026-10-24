<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { errorText } from '#lib/stopwatch.svelte.ts';
	import { ago, madridDateISO } from '#lib/time.ts';

	interface Backup {
		id: number;
		taken_at: string;
		kind: 'semanal' | 'manual';
		size_bytes: number;
		counts: Record<string, number>;
		member: { display_name: string } | null;
	}

	let list = $state<Backup[] | null>(null);
	let missing = $state(false);
	let busy = $state(false);
	let downloading = $state<number | null>(null);

	async function load() {
		const { data, error } = await supabase
			.from('backups')
			.select('id, taken_at, kind, size_bytes, counts, member:members(display_name)')
			.order('taken_at', { ascending: false })
			.limit(24);
		if (error) {
			missing = true;
			return;
		}
		missing = false;
		list = data as unknown as Backup[];
	}

	onMount(() => void load());

	async function backupNow() {
		busy = true;
		const { error } = await supabase.rpc('backup_now');
		busy = false;
		if (error) return void toast(errorText(error), 'bad');
		toast('Copia hecha.', 'ok');
		await load();
	}

	async function download(b: Backup) {
		downloading = b.id;
		const { data, error } = await supabase.from('backups').select('data').eq('id', b.id).single();
		downloading = null;
		if (error || !data) return void toast(errorText(error), 'bad');
		const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `trinity-panel-copia-${madridDateISO(new Date(b.taken_at))}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
</script>

{#if missing}
	<p class="alert" role="status">Falta ejecutar la migración de la Fase 7 en Supabase (mira el README).</p>
{:else if list}
	<div class="backups">
		<div class="top">
			<button type="button" class="btn" onclick={backupNow} disabled={busy}>{busy ? 'Copiando…' : 'Hacer copia ahora'}</button>
			<span class="help">Se guardan las 12 últimas de cada tipo.</span>
		</div>

		{#if list.length}
			<ul class="list">
				{#each list as b (b.id)}
					<li>
						<span class="what">
							<span class="when">{ago(b.taken_at)}</span>
							<span class="help">
								{b.kind === 'semanal' ? 'Semanal' : b.member ? `A mano · ${b.member.display_name}` : 'A mano'}
								· {b.counts.sessions ?? 0} sesiones · {kb(b.size_bytes)}
							</span>
						</span>
						<button type="button" class="btn btn-quiet" onclick={() => download(b)} disabled={downloading === b.id}>
							{downloading === b.id ? 'Preparando…' : 'Descargar'}
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="help">Aún no hay copias. La primera automática sale el lunes de madrugada.</p>
		{/if}
	</div>
{:else}
	<p class="help">Cargando…</p>
{/if}

<style>
	.backups {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.top {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--bg-raised);
		max-height: 320px;
		overflow-y: auto;
	}

	.list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 8px 10px 14px;
	}

	.list li + li {
		border-top: 1px solid var(--line);
	}

	.what {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.when {
		font-size: 13px;
		font-weight: 500;
	}

	.when::first-letter {
		text-transform: uppercase;
	}
</style>
