import { untrack } from 'svelte';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import { auth } from './auth.svelte.ts';
import { team, toSession, SESSION_COLS, type SessionRow, type WeekSession } from './team.svelte.ts';
import { madridDateISO, addDaysISO } from './time.ts';

/**
 * Reglas del pacto (Fase 6). El servidor (`pact_status`) decide el estado de
 * cada semana; aquí solo se combina con las horas en vivo de la semana actual.
 */

export type WeekStatus =
	| 'en_curso'
	| 'cumplida'
	| 'justificada'
	| 'recuperando'
	| 'recuperada'
	| 'toque'
	| 'penalizacion';

export interface PactWeek {
	member_id: string;
	week_start: string;
	minutes: number;
	review: number;
	min_base: number;
	absent: number;
	target: number;
	carry: number;
	status: WeekStatus;
	strike: number | null;
}

export type AbsenceReason = 'examenes' | 'lesion' | 'viaje' | 'partido' | 'otro';

export interface Absence {
	id: string;
	member_id: string;
	starts_on: string;
	ends_on: string;
	reason: AbsenceReason;
	note: string | null;
	created_by: string | null;
	created_at: string;
}

export interface MinimumChange {
	starts_on: string;
	minutes: number;
	note: string | null;
	changed_by: string | null;
	changed_at: string;
}

export const REASONS: { id: AbsenceReason; label: string; adminOnly?: boolean }[] = [
	{ id: 'examenes', label: 'Exámenes' },
	{ id: 'lesion', label: 'Lesión o enfermedad' },
	{ id: 'viaje', label: 'Viaje' },
	{ id: 'partido', label: 'Partido o concentración' },
	{ id: 'otro', label: 'Otro', adminOnly: true }
];

export const reasonLabel = (r: string) => REASONS.find((x) => x.id === r)?.label ?? r;

export const STATUS: Record<WeekStatus, { label: string; tone: 'ok' | 'soft' | 'warn' | 'bad' | 'open' }> = {
	en_curso: { label: 'En curso', tone: 'open' },
	cumplida: { label: 'Cumplida', tone: 'ok' },
	recuperada: { label: 'Recuperada', tone: 'ok' },
	justificada: { label: 'Justificada', tone: 'soft' },
	recuperando: { label: 'Recuperando', tone: 'warn' },
	toque: { label: 'Toque de atención', tone: 'warn' },
	penalizacion: { label: 'Penalización', tone: 'bad' }
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

class Pact {
	weeks = $state<PactWeek[]>([]);
	absences = $state<Absence[]>([]);
	minimums = $state<MinimumChange[]>([]);
	/** Sesiones cerradas que esperan validación (de cualquiera). */
	pending = $state<WeekSession[]>([]);
	pactStart = $state('');
	loaded = $state(false);
	failed = $state(false);

	#users = 0;
	#seq = 0;
	#channel: RealtimeChannel | null = null;
	#stopWatch: (() => void) | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;

	/** Lunes de la semana actual, "AAAA-MM-DD". */
	get thisWeek(): string {
		return madridDateISO(team.week.start);
	}

	async load() {
		const id = ++this.#seq;
		const since = addDaysISO(madridDateISO(new Date(team.now)), -120);
		const [ps, ab, mc, pe, st] = await Promise.all([
			supabase.rpc('pact_status'),
			supabase
				.from('absences')
				.select('id, member_id, starts_on, ends_on, reason, note, created_by, created_at')
				.gte('ends_on', since)
				.order('starts_on', { ascending: false }),
			supabase
				.from('minimum_changes')
				.select('starts_on, minutes, note, changed_by, changed_at')
				.order('starts_on', { ascending: false })
				.limit(12),
			supabase
				.from('sessions')
				.select(SESSION_COLS)
				.eq('needs_review', true)
				.not('ended_at', 'is', null)
				.order('started_at', { ascending: false })
				.limit(100),
			supabase.from('app_settings').select('pact_starts_on').single()
		]);
		if (id !== this.#seq) return;

		if (ps.error) {
			this.failed = true;
			this.loaded = true;
			return;
		}
		this.failed = false;
		this.weeks = ((ps.data ?? []) as PactWeek[]).map((w) => ({
			...w,
			minutes: num(w.minutes),
			review: num(w.review),
			min_base: num(w.min_base),
			absent: num(w.absent),
			target: num(w.target),
			carry: num(w.carry),
			strike: w.strike == null ? null : num(w.strike)
		}));
		this.absences = (ab.data ?? []) as Absence[];
		this.minimums = ((mc.data ?? []) as MinimumChange[]).map((m) => ({ ...m, minutes: num(m.minutes) }));
		this.pending = ((pe.data ?? []) as SessionRow[]).map(toSession);
		this.pactStart = (st.data as { pact_starts_on?: string } | null)?.pact_starts_on ?? '';
		this.loaded = true;

		// El mínimo vigente sale del historial (puede haber cambiado este lunes).
		const cur = this.weeks.find((w) => w.week_start === this.thisWeek);
		if (cur) team.minMinutes = cur.min_base;
	}

	/** Llamar al montar una vista que use el pacto; devuelve la limpieza. */
	use(): () => void {
		this.#users++;
		if (this.#users === 1) {
			// Cualquier cambio de sesiones (lo vigila `team`) recalcula el pacto.
			this.#stopWatch = $effect.root(() => {
				$effect(() => {
					void team.revision;
					untrack(() => this.#soon());
				});
			});
			this.#channel = supabase
				.channel('pacto')
				.on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, () => this.#soon())
				.on('postgres_changes', { event: '*', schema: 'public', table: 'minimum_changes' }, () => this.#soon())
				.on('postgres_changes', { event: '*', schema: 'public', table: 'session_reviews' }, () => this.#soon())
				.on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => this.#soon())
				.subscribe();
		}
		return () => {
			this.#users--;
			if (this.#users === 0) {
				this.#stopWatch?.();
				this.#stopWatch = null;
				if (this.#channel) void supabase.removeChannel(this.#channel);
				this.#channel = null;
				if (this.#timer) clearTimeout(this.#timer);
			}
		};
	}

	#soon() {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.load(), 150);
	}

	// ─── Consultas ──────────────────────────────────────────────────────────

	of(memberId: string): PactWeek[] {
		return this.weeks.filter((w) => w.member_id === memberId);
	}

	current(memberId: string): PactWeek | undefined {
		return this.weeks.find((w) => w.member_id === memberId && w.week_start === this.thisWeek);
	}

	previous(memberId: string): PactWeek | undefined {
		const prev = addDaysISO(this.thisWeek, -7);
		return this.weeks.find((w) => w.member_id === memberId && w.week_start === prev);
	}

	/** Lo que tiene que hacer esta semana: mínimo (con ausencias) + lo que recupera. */
	goalOf(memberId: string): number {
		const c = this.current(memberId);
		return c ? c.target + c.carry : team.minMinutes;
	}

	/** Estado de la semana actual con las horas en vivo. */
	liveStatus(memberId: string): WeekStatus | null {
		const c = this.current(memberId);
		if (!c) return null;
		if (c.status === 'justificada') return 'justificada';
		return team.minutesBy(memberId) >= c.target + c.carry - 0.5 ? 'cumplida' : 'en_curso';
	}

	strikes(memberId: string): number {
		return this.of(memberId).reduce((n, w) => Math.max(n, w.strike ?? 0), 0);
	}

	/** Semanas seguidas cumplidas o recuperadas (las justificadas no la rompen). */
	streak(memberId: string): { now: number; best: number } {
		const list = this.of(memberId);
		let run = 0;
		let best = 0;
		for (const w of list) {
			const st = w.week_start === this.thisWeek ? this.liveStatus(memberId) : w.status;
			if (st === 'cumplida' || st === 'recuperada') best = Math.max(best, ++run);
			else if (st === 'justificada' || st === 'en_curso' || st === 'recuperando') continue;
			else run = 0;
		}
		return { now: run, best };
	}

	/** Minutos desde que empezó el pacto (la semana actual, en vivo). */
	total(memberId: string): number {
		return this.of(memberId).reduce(
			(t, w) => t + (w.week_start === this.thisWeek ? team.minutesBy(memberId) : w.minutes),
			0
		);
	}

	/** Ausencias de un miembro que tocan una semana. */
	absencesIn(memberId: string, weekStart: string): Absence[] {
		const end = addDaysISO(weekStart, 6);
		return this.absences.filter((a) => a.member_id === memberId && a.starts_on <= end && a.ends_on >= weekStart);
	}

	/** Lo que tú puedes validar (de los demás). */
	get reviewable(): WeekSession[] {
		const me = auth.member;
		if (!me?.is_admin) return [];
		return this.pending.filter((s) => s.member_id !== me.id);
	}
}

export const pact = new Pact();
