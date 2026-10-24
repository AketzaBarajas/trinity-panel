<script lang="ts">
	import { team } from '#lib/team.svelte.ts';
	import { memberColor } from '#lib/palette.ts';
	import { fmtHM, fmtHuman } from '#lib/time.ts';
	import { pact } from '#lib/pact.svelte.ts';
	import Orb from './Orb.svelte';

	let { meId }: { meId: string } = $props();

	const H = 460;
	const NODE_W = 200;
	const NODE_H = 62;
	const R = 118;

	let width = $state(980);
	let active = $state<string | null>(null);

	const cy = H / 2;
	// Por debajo de 700 px las hebras no caben: versión compacta con los mismos datos.
	const compact = $derived(width < 700);
	const W = $derived(Math.max(width, 640));
	const ox = $derived(Math.max(NODE_W + 160 + R, W * 0.39));
	const fanR = $derived(Math.max(R + 110, Math.min(W - ox - 200, 330)));

	interface Row {
		key: string;
		id: string | null;
		name: string;
		role: string | null;
		color: string;
		minutes: number;
		live: boolean;
		pending: boolean;
		y: number;
	}

	const rows = $derived.by<Row[]>(() => {
		const list: Omit<Row, 'y'>[] = [
			...team.members.map((m) => ({
				key: m.id,
				id: m.id,
				name: m.display_name,
				role: m.role_label,
				color: memberColor(m.color),
				minutes: team.minutesBy(m.id),
				live: team.running(m.id).length > 0,
				pending: false
			})),
			...team.pending.map((p) => ({
				key: p.discord_id,
				id: null,
				name: p.display_name,
				role: null,
				color: 'var(--ink-4)',
				minutes: 0,
				live: false,
				pending: true
			}))
		];
		const gap = list.length > 3 ? 104 : 128;
		return list.map((r, i) => ({ ...r, y: cy + (i - (list.length - 1) / 2) * gap }));
	});

	const colorOf = $derived(new Map(rows.filter((r) => r.id).map((r) => [r.id as string, r.color])));

	// Una hebra por sesión. Sin sesiones, una línea de estructura tenue (no es un dato).
	const inStrands = $derived.by(() => {
		const out: { d: string; member: string | null; color: string; ghost: boolean; live: boolean }[] = [];
		rows.forEach((row, i) => {
			const own = row.id ? team.sessions.filter((s) => s.member_id === row.id) : [];
			const n = Math.max(own.length, 1);
			// El nodo de arriba entra por arriba-izquierda (en SVG la y crece hacia abajo).
			const base = Math.PI - (i - (rows.length - 1) / 2) * 0.34;
			for (let k = 0; k < n; k++) {
				const off = k - (n - 1) / 2;
				const x0 = NODE_W;
				const y0 = row.y + Math.max(-NODE_H * 0.32, Math.min(NODE_H * 0.32, off * 2.6));
				const a = base + off * 0.03;
				const ex = ox + Math.cos(a) * R;
				const ey = cy + Math.sin(a) * R;
				const dx = ex - x0;
				out.push({
					d: `M ${x0} ${y0} C ${x0 + dx * 0.5} ${y0}, ${ex - dx * 0.42} ${ey}, ${ex} ${ey}`,
					member: row.id,
					color: row.color,
					ghost: own.length === 0,
					live: !!own[k] && !own[k].ended_at
				});
			}
		});
		return out;
	});

	const fan = $derived.by(() => {
		const list = team.specialties;
		// El abanico cabe siempre en la altura del escenario.
		const half = Math.min((62 * Math.PI) / 180, Math.asin(Math.min(1, (H / 2 - 22) / fanR)));
		const span = half * 2;
		return list.map((sp, i) => {
			const a = list.length > 1 ? -span / 2 + (span * i) / (list.length - 1) : 0;
			const sx = ox + Math.cos(a) * fanR;
			const sy = cy + Math.sin(a) * fanR;
			const sessions = team.sessions.filter((s) => s.specialties.includes(sp.slug));
			const minutes = sessions.reduce((t, s) => t + team.minutesOf(s) / Math.max(s.specialties.length, 1), 0);
			return { ...sp, a, sx, sy, sessions, minutes };
		});
	});

	const outStrands = $derived.by(() => {
		const out: { d: string; member: string | null; ghost: boolean }[] = [];
		for (const f of fan) {
			const n = Math.max(f.sessions.length, 1);
			for (let k = 0; k < n; k++) {
				const off = k - (n - 1) / 2;
				const a0 = f.a * 0.62 + off * 0.025;
				const x0 = ox + Math.cos(a0) * R;
				const y0 = cy + Math.sin(a0) * R;
				const ty = f.sy + off * 1.6;
				const dx = f.sx - x0;
				out.push({
					d: `M ${x0} ${y0} C ${x0 + dx * 0.55} ${y0}, ${f.sx - dx * 0.3} ${ty}, ${f.sx - 6} ${ty}`,
					member: f.sessions[k]?.member_id ?? null,
					ghost: f.sessions.length === 0
				});
			}
		}
		return out;
	});

	const shares = $derived(rows.filter((r) => r.id && r.minutes > 0).map((r) => ({ color: r.color, weight: r.minutes })));
	const anyLive = $derived(rows.some((r) => r.live));

	const dim = (member: string | null) => active !== null && member !== active;
	const hl = (member: string | null) => active !== null && member === active;
</script>

<section
	class="stage"
	class:compact
	aria-label="Flujo de horas de la semana"
	bind:clientWidth={width}
	style:height={compact ? undefined : `${H}px`}
>
	{#if compact}
		<div class="c-orb">
			<Orb size={200} {shares} live={anyLive}>
				<span class="total num">{fmtHM(team.totalMinutes)}</span>
				<span class="total-label">equipo · semana {team.week.number}</span>
			</Orb>
		</div>
		<ul class="c-members">
			{#each rows as r (r.key)}
				<li class:pending={r.pending} style:--c={r.color}>
					<span class="dot" class:live={r.live}></span>
					<span class="name">{r.name}</span>
					{#if r.role}<span class="role">{r.role}</span>{/if}
					<span class="c-val num">{r.pending ? 'Aún no ha entrado' : fmtHM(r.minutes)}</span>
				</li>
			{/each}
		</ul>
		<ul class="c-specs">
			{#each fan as f (f.slug)}
				<li><span class="dot" style:--c={f.color}></span>{f.name}<span class="spec-time num">{fmtHM(f.minutes)}</span></li>
			{/each}
		</ul>
	{:else}
	<svg class="strands" width={W} height={H} viewBox="0 0 {W} {H}" aria-hidden="true">
		<defs>
			<filter id="strand-glow" x="-5%" y="-5%" width="110%" height="110%">
				<feGaussianBlur stdDeviation="3" />
			</filter>
		</defs>

		<!-- anillos exteriores del orbe -->
		<circle cx={ox} cy={cy} r={R * 1.35} class="halo dashed" />
		<circle cx={ox} cy={cy} r={R * 1.7} class="halo" />

		<!-- resplandor solo de hebras con datos -->
		<g filter="url(#strand-glow)" opacity="0.5">
			{#each inStrands.filter((s) => !s.ghost) as s, i (i)}
				<path d={s.d} style:stroke={s.color} class="glow" class:dim={dim(s.member)} />
			{/each}
		</g>

		{#each inStrands as s, i (i)}
			<path
				d={s.d}
				style:stroke={s.color}
				class="in"
				class:ghost={s.ghost}
				class:dim={dim(s.member)}
				class:hl={hl(s.member)}
			/>
			{#if s.live}
				<path d={s.d} class="pulse" />
			{/if}
		{/each}

		{#each outStrands as s, i (i)}
			<path
				d={s.d}
				class="out"
				class:ghost={s.ghost}
				class:dim={active !== null && !hl(s.member)}
				style:stroke={hl(s.member) ? colorOf.get(s.member as string) : undefined}
			/>
		{/each}

		{#each fan as f (f.slug)}
			<circle cx={f.sx} cy={f.sy} r="3" style:fill={f.color} class="spec-dot" class:dim={active !== null && !f.sessions.some((s) => s.member_id === active)} />
		{/each}
	</svg>

	{#each rows as r (r.key)}
		{#if r.pending}
			<div class="node pending" style:top="{r.y - NODE_H / 2}px" style:width="{NODE_W}px" style:height="{NODE_H}px">
				<span class="who"><span class="name">{r.name}</span></span>
				<span class="meta">Aún no ha entrado</span>
			</div>
		{:else}
			<button
				type="button"
				class="node"
				class:me={r.id === meId}
				class:faded={active !== null && active !== r.id}
				class:on={active === r.id}
				style:top="{r.y - NODE_H / 2}px"
				style:width="{NODE_W}px"
				style:height="{NODE_H}px"
				style:--c={r.color}
				onpointerenter={() => (active = r.id)}
				onpointerleave={() => (active = null)}
				onfocus={() => (active = r.id)}
				onblur={() => (active = null)}
				aria-label="{r.name}: {fmtHM(r.minutes)} esta semana{r.live ? ', trabajando ahora' : ''}"
			>
				<span class="who">
					<span class="dot" class:live={r.live}></span>
					<span class="name">{r.name}</span>
					{#if r.role}<span class="role">{r.role}</span>{/if}
				</span>
				<span class="meta">
					<span class="hours num">{fmtHM(r.minutes)}</span>
					<span class="of">/ {fmtHuman(pact.goalOf(r.id ?? ''))}</span>
				</span>
			</button>
		{/if}
	{/each}

	<div class="orb-slot" style:left="{ox - R}px" style:top="{cy - R}px">
		<Orb size={R * 2} {shares} live={anyLive}>
			<span class="total num">{fmtHM(team.totalMinutes)}</span>
			<span class="total-label">equipo · semana {team.week.number}</span>
		</Orb>
	</div>

	{#each fan as f (f.slug)}
		<div
			class="spec"
			class:dim={active !== null && !f.sessions.some((s) => s.member_id === active)}
			style:left="{f.sx + 10}px"
			style:top="{f.sy}px"
		>
			<span class="spec-name">{f.name}</span>
			<span class="spec-time num">{fmtHM(f.minutes)}</span>
		</div>
	{/each}

	<table class="visually-hidden">
		<caption>Horas de la semana {team.week.number} por persona y especialidad</caption>
		<tbody>
			{#each rows as r (r.key)}
				<tr><th scope="row">{r.name}</th><td>{r.pending ? 'Aún no ha entrado' : fmtHM(r.minutes)}</td></tr>
			{/each}
			{#each fan as f (f.slug)}
				<tr><th scope="row">{f.name}</th><td>{fmtHM(f.minutes)}</td></tr>
			{/each}
		</tbody>
	</table>
	{/if}
</section>

<style>
	.stage {
		position: relative;
		width: 100%;
		background: var(--stage-glow);
	}

	.strands {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	path {
		fill: none;
		stroke-linecap: round;
		transition:
			opacity 220ms ease,
			stroke 220ms ease,
			stroke-opacity 220ms ease;
	}

	.glow {
		stroke-width: 3;
	}

	.in {
		stroke-width: 1;
		stroke-opacity: 0.7;
	}

	/* Canales vacíos: estructura (no datos), línea continua tenue. */
	.in.ghost {
		stroke: var(--line-2) !important;
		stroke-opacity: 1;
	}

	.out {
		stroke: var(--strand);
		stroke-width: 1;
	}

	.out.ghost {
		stroke: var(--line-2);
	}

	.halo {
		fill: none;
		stroke: var(--line);
	}

	.halo.dashed {
		stroke-dasharray: 1 6;
		stroke: var(--line-2);
	}

	.hl {
		stroke-opacity: 1;
		stroke-width: 1.4;
	}

	.dim {
		opacity: 0.12;
	}

	.pulse {
		stroke: var(--ink);
		stroke-width: 1.4;
		stroke-dasharray: 2 26;
		animation: pulse 2.4s linear infinite;
	}

	.spec-dot {
		transition: opacity 220ms ease;
	}

	@keyframes pulse {
		to {
			stroke-dashoffset: -112;
		}
	}

	/* ─── Nodos de miembro ─── */
	.node {
		position: absolute;
		left: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		padding: 0 14px;
		border-radius: var(--r-sm);
		border: 1px solid var(--line-2);
		background: color-mix(in srgb, var(--bg-raised) 92%, transparent);
		text-align: left;
		cursor: default;
		transition:
			border-color 180ms ease,
			opacity 220ms ease,
			transform 180ms var(--ease-out);
	}

	.node.on {
		border-color: var(--c);
	}

	.node.faded {
		opacity: 0.4;
	}

	.node.me::after {
		content: 'tú';
		position: absolute;
		top: 8px;
		right: 10px;
		font-size: 10px;
		color: var(--ink-3);
	}

	.node.pending {
		border-style: dashed;
		background: transparent;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}

	.dot {
		width: 7px;
		height: 7px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--c);
	}

	.dot.live {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 30%, transparent);
		animation: beat 1.6s ease-in-out infinite;
	}

	@keyframes beat {
		50% {
			box-shadow: 0 0 0 6px color-mix(in srgb, var(--c) 0%, transparent);
		}
	}

	.name {
		font-weight: 600;
		font-size: 13px;
		color: var(--ink);
	}

	.role {
		font-size: 12px;
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 12px;
		color: var(--ink-3);
	}

	.hours {
		font-size: 17px;
		font-weight: 600;
		color: var(--ink);
	}

	.of {
		font-size: 12px;
	}

	/* ─── Orbe ─── */
	.orb-slot {
		position: absolute;
	}

	.total {
		font-size: 26px;
		font-weight: 600;
		color: var(--ink);
	}

	.total-label {
		font-size: 11px;
		color: var(--ink-3);
	}

	/* ─── Especialidades ─── */
	.spec {
		position: absolute;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
		transition: opacity 220ms ease;
	}

	.spec-name {
		font-size: 12px;
		color: var(--ink-2);
	}

	.spec-time {
		font-size: 11px;
		color: var(--ink-3);
		padding: 1px 6px;
		border-radius: 5px;
		border: 1px solid var(--line-2);
	}

	/* ─── Compacto (ventanas estrechas) ─── */
	.compact {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 8px 0;
	}

	.c-orb {
		align-self: center;
	}

	.c-members,
	.c-specs {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.c-members li {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 12px 0;
		border-top: 1px solid var(--line);
	}

	.c-members li.pending .name {
		color: var(--ink-3);
	}

	.c-members .dot {
		align-self: center;
	}

	.c-val {
		margin-left: auto;
		font-size: 14px;
		font-weight: 500;
	}

	.pending .c-val {
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-3);
	}

	.c-specs li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 0;
		border-top: 1px solid var(--line);
		font-size: 13px;
		color: var(--ink-2);
	}

	.c-specs .spec-time {
		margin-left: auto;
	}

	@media (prefers-reduced-motion: reduce) {
		.pulse,
		.dot.live {
			animation: none;
		}
	}
</style>
