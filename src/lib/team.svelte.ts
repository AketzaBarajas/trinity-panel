import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import { auth } from './auth.svelte.ts';
import { currentWeek, type Week } from './time.ts';
import { normalizeHex } from './palette.ts';

export interface TeamMember {
	id: string;
	discord_id: string;
	display_name: string;
	avatar_url: string | null;
	role_label: string | null;
	color: string | null;
	is_admin: boolean;
	is_owner: boolean;
	onboarded_at: string | null;
}

export interface Pending {
	discord_id: string;
	display_name: string;
}

export interface Specialty {
	slug: string;
	name: string;
	color: string;
	sort: number;
}

export interface Project {
	id: string;
	name: string;
}

export interface WeekSession {
	id: string;
	member_id: string;
	project_id: string;
	started_at: string;
	ended_at: string | null;
	title: string | null;
	description: string | null;
	is_manual: boolean;
	needs_review: boolean;
	specialties: string[];
}

export const SESSION_COLS =
	'id, member_id, project_id, started_at, ended_at, title, description, is_manual, needs_review, session_specialties(specialty_slug)';

export type SessionRow = Omit<WeekSession, 'specialties'> & {
	session_specialties?: { specialty_slug: string }[];
};

export function toSession(r: SessionRow): WeekSession {
	const { session_specialties, ...s } = r;
	return {
		...s,
		description: s.description ?? null,
		is_manual: !!s.is_manual,
		needs_review: !!s.needs_review,
		specialties: (session_specialties ?? []).map((x) => x.specialty_slug)
	};
}

/** Cambio sobre la lista de sesiones (optimista o confirmado). */
export type Op = (list: WeekSession[]) => WeekSession[];

const ms = (iso: string) => Date.parse(iso);

/**
 * Datos del equipo para la semana en curso (todo real; puede estar a cero),
 * más tus sesiones paradas que aún no has descrito (de cualquier semana).
 */
class Team {
	members = $state<TeamMember[]>([]);
	pending = $state<Pending[]>([]);
	specialties = $state<Specialty[]>([]);
	projects = $state<Project[]>([]);
	minMinutes = $state(240);
	autoCutMinutes = $state(240);
	week = $state<Week>(currentWeek());
	loaded = $state(false);
	/** Diferencia reloj del servidor − reloj del PC, en ms. */
	skew = $state(0);
	/** Reloj compartido (hora del servidor). Avanza solo si hay algo en marcha. */
	now = $state(Date.now());
	/** Últimas 5 sesiones descritas de cualquiera (cualquier fecha). */
	recent = $state<WeekSession[]>([]);
	/** Sube cada vez que llegan datos nuevos (las gráficas se recargan con esto). */
	revision = $state(0);

	/** Lo último que llegó del servidor. */
	#base = $state<WeekSession[]>([]);
	/** Cambios optimistas que aún esperan respuesta. */
	#ops = $state<{ id: number; fn: Op }[]>([]);
	#all = $derived(this.#ops.reduce((list, op) => op.fn(list), this.#base));

	sessions = $derived(this.#all.filter((s) => this.#inWeek(s)));

	/** Tus sesiones paradas sin frase (la ventana "¿Qué has hecho?" las pide). */
	undescribed = $derived(
		this.#all
			.filter((s) => s.member_id === auth.member?.id && s.ended_at && !s.title)
			.sort((a, b) => ms(a.started_at) - ms(b.started_at))
	);

	#channel: RealtimeChannel | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#reload: ReturnType<typeof setTimeout> | null = null;
	#users = 0;
	#opSeq = 0;
	#loadSeq = 0;
	#version = 0;
	#cutAsked: string | null = null;

	#inWeek(s: WeekSession): boolean {
		const end = s.ended_at ? ms(s.ended_at) : Infinity;
		return ms(s.started_at) < this.week.end.getTime() && end > this.week.start.getTime();
	}

	async load() {
		const seq = ++this.#loadSeq;
		const version = this.#version;
		const week = currentWeek(new Date(Date.now() + this.skew));
		const meId = auth.member?.id;

		const [m, a, sp, pr, st, ss, mine, clock, rc] = await Promise.all([
			supabase
				.from('members')
				.select('id, discord_id, display_name, avatar_url, role_label, color, is_admin, is_owner, onboarded_at')
				.order('created_at'),
			supabase.from('allowed_members').select('discord_id, display_name').order('created_at'),
			supabase.from('specialties').select('slug, name, color, sort').order('sort'),
			supabase.from('projects').select('id, name').eq('is_archived', false).order('created_at'),
			supabase.from('app_settings').select('weekly_min_minutes, auto_cut_minutes').single(),
			supabase
				.from('sessions')
				.select(SESSION_COLS)
				.or(`ended_at.gt.${week.start.toISOString()},ended_at.is.null`)
				.lt('started_at', week.end.toISOString())
				.order('started_at'),
			meId
				? supabase
						.from('sessions')
						.select(SESSION_COLS)
						.eq('member_id', meId)
						.not('ended_at', 'is', null)
						.is('title', null)
						.order('started_at')
				: Promise.resolve({ data: [] }),
			this.#serverClock(),
			supabase
				.from('sessions')
				.select(SESSION_COLS)
				.not('title', 'is', null)
				.not('ended_at', 'is', null)
				.order('ended_at', { ascending: false })
				.limit(5)
		]);

		// Llegó otra carga más nueva, o un cambio confirmado mientras esperábamos:
		// estos datos ya son viejos.
		if (seq !== this.#loadSeq) return;
		if (version !== this.#version) return void this.load();

		if (clock !== null) this.skew = clock;
		this.week = week;

		const members = ((m.data ?? []) as TeamMember[]).map((x) => ({ ...x, color: normalizeHex(x.color) }));
		this.members = members;
		const inside = new Set(members.map((x) => x.discord_id));
		this.pending = ((a.data ?? []) as Pending[]).filter((x) => !inside.has(x.discord_id));
		this.specialties = (sp.data ?? []) as Specialty[];
		this.projects = (pr.data ?? []) as Project[];
		if (st.data) {
			this.minMinutes = st.data.weekly_min_minutes;
			if (st.data.auto_cut_minutes) this.autoCutMinutes = st.data.auto_cut_minutes;
		}

		const byId = new Map<string, WeekSession>();
		for (const r of [...((ss.data ?? []) as SessionRow[]), ...((mine.data ?? []) as SessionRow[])]) {
			byId.set(r.id, toSession(r));
		}
		this.#base = [...byId.values()];
		this.recent = ((rc.data ?? []) as SessionRow[]).map(toSession);
		this.loaded = true;
		this.revision++;
		this.#syncTick();
	}

	/** Mide la hora del servidor. Devuelve el desfase o null si no es fiable. */
	async #serverClock(): Promise<number | null> {
		const t0 = Date.now();
		const { data, error } = await supabase.rpc('server_now');
		const t1 = Date.now();
		if (error || !data || t1 - t0 > 2000) return null;
		return ms(data as string) - (t0 + t1) / 2;
	}

	/** Ajusta el reloj con una hora del servidor medida entre t0 y t1. */
	calibrate(serverMs: number, t0: number, t1: number) {
		if (t1 - t0 < 2000) this.skew = serverMs - (t0 + t1) / 2;
	}

	/** Aplica un cambio al instante; devuelve la función que lo quita. */
	optimistic(fn: Op): () => void {
		const id = ++this.#opSeq;
		this.#ops = [...this.#ops, { id, fn }];
		this.#syncTick();
		return () => {
			this.#ops = this.#ops.filter((o) => o.id !== id);
			this.#syncTick();
		};
	}

	/** Aplica un cambio ya confirmado por el servidor (y descarta cargas en vuelo). */
	commit(fn: Op) {
		this.#version++;
		this.#base = fn(this.#base);
		this.#syncTick();
		// Lo confirmado también cambia "últimas actividades" y las gráficas.
		this.#soon();
	}

	find(id: string): WeekSession | undefined {
		return this.#all.find((s) => s.id === id);
	}

	/** Llamar al montar una vista que use el equipo; devuelve la función de limpieza. */
	use(): () => void {
		this.#users++;
		if (this.#users === 1) {
			void this.load();
			this.#channel = supabase
				.channel('team')
				.on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => this.#soon())
				.on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => this.#soon())
				.subscribe();
			document.addEventListener('visibilitychange', this.#onVisibility);
		}
		return () => {
			this.#users--;
			if (this.#users === 0) {
				if (this.#channel) void supabase.removeChannel(this.#channel);
				this.#channel = null;
				if (this.#timer) clearTimeout(this.#timer);
				this.#timer = null;
				document.removeEventListener('visibilitychange', this.#onVisibility);
			}
		};
	}

	/** Agrupa ráfagas de cambios en tiempo real en una sola recarga. */
	#soon() {
		if (this.#reload) clearTimeout(this.#reload);
		this.#reload = setTimeout(() => {
			this.#reload = null;
			void this.load();
		}, 120);
	}

	#onVisibility = () => {
		if (document.visibilityState === 'visible') {
			// Al volver puede haberse perdido algún evento (PC suspendido, red caída).
			this.#soon();
			this.#syncTick();
		}
	};

	#syncTick() {
		if (!this.#timer) this.#loop();
	}

	/**
	 * Segundero. Se alinea con el segundo exacto de TU sesión para que el reloj
	 * nunca se salte ni repita un número, y se para con la pestaña oculta.
	 */
	#loop = () => {
		this.#timer = null;
		this.now = Date.now() + this.skew;

		const mine = auth.member ? this.running(auth.member.id)[0] : undefined;
		if (mine) this.#maybeCut(mine);

		if (!this.sessions.some((s) => !s.ended_at)) return;
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

		const phase = mine ? ms(mine.started_at) % 1000 : 0;
		const into = (((this.now - phase) % 1000) + 1000) % 1000;
		this.#timer = setTimeout(this.#loop, 1000 - into + 8);
	};

	/** Si pg_cron no ha cortado aún tu sesión, pídeselo al servidor. */
	#maybeCut(s: WeekSession) {
		if (s.id.startsWith('temp-') || this.#cutAsked === s.id) return;
		if (this.now - ms(s.started_at) < this.autoCutMinutes * 60000 + 3000) return;
		this.#cutAsked = s.id;
		void supabase.rpc('cut_overdue_sessions').then(() => this.load());
	}

	/** Minutos de una sesión dentro de la semana (las que cruzan el lunes se recortan). */
	minutesOf(s: WeekSession, now = this.now): number {
		const start = Math.max(ms(s.started_at), this.week.start.getTime());
		const end = Math.min(s.ended_at ? ms(s.ended_at) : now, this.week.end.getTime());
		return Math.max(0, (end - start) / 60000);
	}

	/** Duración total de una sesión en minutos (sin recortar a la semana). */
	durationOf(s: WeekSession, now = this.now): number {
		return Math.max(0, ((s.ended_at ? ms(s.ended_at) : now) - ms(s.started_at)) / 60000);
	}

	minutesBy(memberId: string): number {
		return this.sessions.filter((s) => s.member_id === memberId).reduce((t, s) => t + this.minutesOf(s), 0);
	}

	get totalMinutes(): number {
		return this.sessions.reduce((t, s) => t + this.minutesOf(s), 0);
	}

	running(memberId?: string): WeekSession[] {
		return this.sessions.filter((s) => !s.ended_at && (!memberId || s.member_id === memberId));
	}

	/** Minutos por día de la semana (L..D), opcionalmente de un miembro. */
	perDay(memberId?: string): number[] {
		const out = Array(7).fill(0);
		const days = [...this.week.days, this.week.end].map((d) => d.getTime());
		for (const s of this.sessions) {
			if (memberId && s.member_id !== memberId) continue;
			const a = ms(s.started_at);
			const b = s.ended_at ? ms(s.ended_at) : this.now;
			for (let i = 0; i < 7; i++) {
				const lo = Math.max(a, days[i]);
				const hi = Math.min(b, days[i + 1]);
				if (hi > lo) out[i] += (hi - lo) / 60000;
			}
		}
		return out;
	}

	/** Sesiones de la semana por día (cuenta por día de inicio). */
	countPerDay(): number[] {
		const out = Array(7).fill(0);
		const days = [...this.week.days, this.week.end].map((d) => d.getTime());
		for (const s of this.sessions) {
			const a = ms(s.started_at);
			const i = days.findIndex((d, k) => k < 7 && a >= d && a < days[k + 1]);
			if (i >= 0) out[i]++;
		}
		return out;
	}
}

export const team = new Team();
