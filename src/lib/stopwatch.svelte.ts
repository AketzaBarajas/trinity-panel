import { supabase } from './supabase.ts';
import { auth } from './auth.svelte.ts';
import { team, toSession, type SessionRow, type WeekSession } from './team.svelte.ts';
import { toast } from './toast.svelte.ts';
import { fmtHuman } from './time.ts';

export interface Draft {
	title: string;
	description: string;
	specialties: string[];
	projectId: string;
}

export type DialogState =
	| { mode: 'describe'; id: string }
	| { mode: 'manual' }
	/** Cambiar frase, especialidades o descripción de una sesión ya guardada (nunca las horas). */
	| { mode: 'edit'; session: WeekSession }
	| null;

const LAST_PROJECT = 'trinity:last-project';
const LAST_SPECS = 'trinity:last-specialties';

const MESSAGES: Record<string, string> = {
	trinity_already_running: 'Ya tienes un cronómetro en marcha (quizá en otro dispositivo).',
	trinity_not_running: 'Tu cronómetro ya estaba parado.',
	trinity_no_project: 'No hay ningún proyecto activo. Un admin tiene que crear uno.',
	trinity_bad_title: 'Escribe qué has hecho en una frase (máximo 140 caracteres).',
	trinity_bad_description: 'La descripción es demasiado larga (máximo 2000 caracteres).',
	trinity_bad_specialties: 'Elige al menos una especialidad.',
	trinity_bad_project: 'Ese proyecto ya no existe.',
	trinity_not_yours: 'Esa sesión ya no existe o no es tuya.',
	trinity_still_running: 'Esa sesión sigue en marcha.',
	trinity_cannot_discard: 'Esa sesión ya no se puede descartar.',
	trinity_bad_range: 'Revisa las horas: el fin va después del inicio, como mucho 12 h y nada en el futuro.',
	trinity_too_old: 'Solo puedes añadir horas de los últimos 7 días.',
	trinity_overlap: 'Se solapa con otra sesión tuya.',
	trinity_not_member: 'Tu cuenta no está en TRINITY.',
	trinity_not_admin: 'Eso solo lo puede hacer un admin.',
	trinity_bad_reason: 'Escribe el motivo (entre 3 y 280 caracteres).',
	trinity_not_found: 'Ya no existe (quizá lo cambió otro miembro).',
	trinity_review_own: 'Tus propias sesiones las valida otro admin.',
	trinity_bad_minimum: 'El mínimo tiene que estar entre 0 y 100 h.',
	trinity_bad_week: 'Elige un lunes de esta semana o posterior.',
	trinity_bad_absence_range: 'Revisa las fechas: el fin va después del inicio y como mucho 60 días.',
	trinity_bad_absence_reason: 'Elige el motivo de la ausencia.',
	trinity_absence_other: 'El pacto solo justifica exámenes, lesión, viajes y partidos. Para otro motivo, habla con un admin.',
	trinity_absence_late: 'Hay que avisar al menos 48 h antes. Si es una urgencia, pídele a un admin que la marque.',
	trinity_absence_too_old: 'Una lesión se avisa en cuanto se pueda: como mucho 7 días después.',
	trinity_absence_note: 'Con el motivo «Otro» hay que escribir una nota.',
	trinity_absence_overlap: 'Ya hay una ausencia en esas fechas.',
	trinity_not_owner: 'Eso solo lo puede hacer el admin principal.',
	trinity_bad_webhook: 'Esa URL no es un webhook de Discord. Cópiala entera desde Integraciones → Webhooks.',
	trinity_no_webhook: 'Discord aún no está conectado.',
	trinity_bad_kind: 'Ese tipo de aviso no existe.',
	trinity_nothing_to_send: 'No hay nada que mandar: el pacto aún no ha empezado o nadie va por debajo del 50 %.',
	trinity_too_fast: 'Espera unos segundos antes de repetirlo.'
};

export function errorText(e: { message?: string; code?: string } | null): string {
	const m = e?.message ?? '';
	const key = /trinity_[a-z_]+/.exec(m)?.[0];
	if (key && MESSAGES[key]) return MESSAGES[key];
	if (e?.code === 'PGRST202') return 'Falta ejecutar una migración en Supabase (mira el README).';
	if (/fetch|network/i.test(m)) return 'Sin conexión con el servidor. Vuelve a intentarlo.';
	return 'No se ha podido guardar. Vuelve a intentarlo.';
}

function read<T>(key: string, fallback: T): T {
	try {
		const v = localStorage.getItem(key);
		return v ? (JSON.parse(v) as T) : fallback;
	} catch {
		return fallback;
	}
}

function write(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* modo privado: no pasa nada */
	}
}

const patch = (id: string, d: Draft) => (list: WeekSession[]) =>
	list.map((x) =>
		x.id === id
			? {
					...x,
					title: d.title.trim(),
					description: d.description.trim() || null,
					project_id: d.projectId || x.project_id,
					specialties: [...d.specialties]
				}
			: x
	);

class Stopwatch {
	dialog = $state<DialogState>(null);
	busy = $state(false);
	/** Error que mostrar al reabrir la ventana tras un fallo al guardar. */
	error = $state<string | null>(null);
	/** Lo que llevabas escrito si cerraste la ventana o falló el guardado. */
	drafts = new Map<string, Draft>();
	#dismissed = new Set<string>();

	get mine(): WeekSession | null {
		return auth.member ? (team.running(auth.member.id)[0] ?? null) : null;
	}

	/** Proyecto por defecto: el último que usaste, si sigue activo. */
	defaultProject(): string {
		const last = read<string>(LAST_PROJECT, '');
		return team.projects.find((p) => p.id === last)?.id ?? team.projects[0]?.id ?? '';
	}

	lastSpecialties(): string[] {
		return read<string[]>(LAST_SPECS, []);
	}

	async start() {
		const me = auth.member;
		if (!me || this.mine || this.busy) return;

		const project = this.defaultProject();
		const t0 = Date.now();
		const temp: WeekSession = {
			id: `temp-${t0}`,
			member_id: me.id,
			project_id: project,
			started_at: new Date(t0 + team.skew).toISOString(),
			ended_at: null,
			title: null,
			description: null,
			is_manual: false,
			needs_review: false,
			specialties: []
		};

		const undo = team.optimistic((l) => [...l, temp]);
		this.busy = true;
		const { data, error } = await supabase.rpc('start_session', { p_project_id: project || null });
		const t1 = Date.now();
		this.busy = false;

		if (error || !data) {
			undo();
			toast(errorText(error), 'bad');
			void team.load();
			return;
		}

		const row = toSession(data as SessionRow);
		team.calibrate(Date.parse(row.started_at), t0, t1);
		team.commit((l) => [...l.filter((s) => s.id !== row.id), row]);
		undo();
	}

	async stop() {
		const s = this.mine;
		if (!s || this.busy || s.id.startsWith('temp-')) return;

		const now = Date.now() + team.skew;
		const startMs = Date.parse(s.started_at);
		const short = now - startMs < 60_000;
		const endedAt = new Date(Math.min(now, startMs + team.autoCutMinutes * 60_000)).toISOString();

		const undo = team.optimistic((l) =>
			short ? l.filter((x) => x.id !== s.id) : l.map((x) => (x.id === s.id ? { ...x, ended_at: endedAt } : x))
		);
		// La ventana se abre en el acto; el guardado va por detrás.
		if (!short) this.openDescribe(s.id);

		this.busy = true;
		const { data, error } = await supabase.rpc('stop_session');
		this.busy = false;

		if (error) {
			undo();
			if (this.dialog?.mode === 'describe' && this.dialog.id === s.id) this.dialog = null;
			toast(errorText(error), 'bad');
			void team.load();
			return;
		}

		const row = data as SessionRow | null;
		if (!row?.id) {
			team.commit((l) => l.filter((x) => x.id !== s.id));
			undo();
			if (this.dialog?.mode === 'describe' && this.dialog.id === s.id) this.dialog = null;
			toast('Menos de 1 minuto: no se ha guardado.');
			return;
		}

		const closed = toSession(row);
		team.commit((l) => l.map((x) => (x.id === closed.id ? closed : x)));
		undo();
	}

	openDescribe(id: string) {
		this.error = null;
		this.dialog = { mode: 'describe', id };
	}

	openEdit(session: WeekSession) {
		this.error = null;
		this.dialog = { mode: 'edit', session };
	}

	openManual() {
		this.error = null;
		this.dialog = { mode: 'manual' };
	}

	/** La primera sesión pendiente de describir. */
	openPending() {
		const next = team.undescribed[0];
		if (next) this.openDescribe(next.id);
	}

	/** Cerrar sin guardar ("Más tarde" o Esc). Se queda pendiente en la cabecera. */
	dismiss(draft?: Draft) {
		const d = this.dialog;
		if (d?.mode === 'describe') {
			this.#dismissed.add(d.id);
			if (draft) this.drafts.set(d.id, draft);
		}
		this.dialog = null;
		this.error = null;
	}

	isDismissed(id: string) {
		return this.#dismissed.has(id);
	}

	/** Guarda frase y demás. `edited` = sesión antigua abierta con "Editar". */
	async describe(id: string, d: Draft, edited?: WeekSession) {
		const s = team.find(id) ?? edited;
		const undo = team.optimistic(patch(id, d));
		this.drafts.delete(id);
		this.dialog = null;
		this.error = null;
		if (!edited) {
			write(LAST_PROJECT, d.projectId);
			write(LAST_SPECS, d.specialties);
		}

		const { error } = await supabase.rpc('describe_session', {
			p_session_id: id,
			p_title: d.title.trim(),
			p_specialties: d.specialties,
			p_description: d.description.trim() || null,
			p_project_id: d.projectId || null
		});

		if (error) {
			undo();
			this.drafts.set(id, d);
			this.error = errorText(error);
			this.dialog = edited ? { mode: 'edit', session: edited } : { mode: 'describe', id };
			return;
		}

		team.commit(patch(id, d));
		undo();
		toast(edited ? 'Cambios guardados' : s ? `Guardado · ${fmtHuman(team.durationOf(s))}` : 'Guardado', 'ok');
	}

	async discard(id: string) {
		const undo = team.optimistic((l) => l.filter((x) => x.id !== id));
		this.drafts.delete(id);
		this.dialog = null;
		const { error } = await supabase.rpc('discard_session', { p_session_id: id });
		if (error) {
			undo();
			toast(errorText(error), 'bad');
			return;
		}
		team.commit((l) => l.filter((x) => x.id !== id));
		undo();
		toast('Sesión descartada. No cuenta para nadie.');
	}

	/** Devuelve el mensaje de error, o null si se guardó. */
	async addManual(start: Date, end: Date, d: Draft): Promise<string | null> {
		this.busy = true;
		const { data, error } = await supabase.rpc('add_manual_session', {
			p_started_at: start.toISOString(),
			p_ended_at: end.toISOString(),
			p_title: d.title.trim(),
			p_specialties: d.specialties,
			p_description: d.description.trim() || null,
			p_project_id: d.projectId || null
		});
		this.busy = false;
		if (error || !data) return errorText(error);

		write(LAST_PROJECT, d.projectId);
		write(LAST_SPECS, d.specialties);
		const row = { ...toSession(data as SessionRow), specialties: [...d.specialties] };
		team.commit((l) => [...l.filter((x) => x.id !== row.id), row]);
		this.dialog = null;
		toast(`Añadido a mano · ${fmtHuman(team.durationOf(row))}. Un admin lo validará.`, 'ok');
		return null;
	}
}

export const stopwatch = new Stopwatch();
