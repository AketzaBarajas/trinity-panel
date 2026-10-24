import { addDaysISO, currentWeek, madridDateISO } from './time.ts';
import type { WeekSession } from './team.svelte.ts';

/** Atajos de fechas del registro. 'rango' = fechas escritas a mano. */
export type Preset = 'todo' | 'semana' | 'pasada' | 'mes' | '30d' | 'rango';

export const PRESETS: { id: Exclude<Preset, 'rango'>; label: string }[] = [
	{ id: 'todo', label: 'Todo' },
	{ id: 'semana', label: 'Esta semana' },
	{ id: 'pasada', label: 'Semana pasada' },
	{ id: 'mes', label: 'Este mes' },
	{ id: '30d', label: '30 días' }
];

export interface Filters {
	members: string[];
	specialties: string[];
	projects: string[];
	q: string;
	preset: Preset;
	/** "AAAA-MM-DD" o '' (sin límite). Solo se usan tal cual con preset 'rango'. */
	from: string;
	to: string;
}

export const emptyFilters = (): Filters => ({
	members: [],
	specialties: [],
	projects: [],
	q: '',
	preset: 'todo',
	from: '',
	to: ''
});

/** Días (Madrid) que cubre un atajo, contando desde `now`. */
export function presetRange(p: Preset, now: Date, custom: { from: string; to: string }): { from: string; to: string } {
	const today = madridDateISO(now);
	switch (p) {
		case 'todo':
			return { from: '', to: '' };
		case 'semana': {
			const w = currentWeek(now);
			return { from: madridDateISO(w.start), to: addDaysISO(madridDateISO(w.start), 6) };
		}
		case 'pasada': {
			const mon = madridDateISO(currentWeek(now).start);
			return { from: addDaysISO(mon, -7), to: addDaysISO(mon, -1) };
		}
		case 'mes':
			return { from: `${today.slice(0, 8)}01`, to: today };
		case '30d':
			return { from: addDaysISO(today, -29), to: today };
		case 'rango': {
			// Si están al revés, se ordenan (nadie quiere un registro vacío por un despiste).
			const { from, to } = custom;
			return from && to && from > to ? { from: to, to: from } : { from, to };
		}
	}
}

export const activeCount = (f: Filters) =>
	f.members.length + f.specialties.length + f.projects.length + (f.q.trim() ? 1 : 0) + (f.preset !== 'todo' ? 1 : 0);

// ─── URL (los filtros sobreviven a recargar y se pueden pasar por Discord) ───

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function fromParams(sp: Pick<URLSearchParams, 'get'>): Filters {
	const f = emptyFilters();
	f.members = list(sp.get('persona'));
	f.specialties = list(sp.get('especialidad'));
	f.projects = list(sp.get('proyecto'));
	f.q = (sp.get('q') ?? '').slice(0, 100);
	const d = sp.get('fechas') as Preset | null;
	const from = sp.get('desde') ?? '';
	const to = sp.get('hasta') ?? '';
	if (ISO.test(from) || ISO.test(to)) {
		f.preset = 'rango';
		f.from = ISO.test(from) ? from : '';
		f.to = ISO.test(to) ? to : '';
	} else if (d && PRESETS.some((p) => p.id === d)) {
		f.preset = d;
	}
	return f;
}

export function toParams(f: Filters): string {
	const sp = new URLSearchParams();
	if (f.members.length) sp.set('persona', f.members.join(','));
	if (f.specialties.length) sp.set('especialidad', f.specialties.join(','));
	if (f.projects.length) sp.set('proyecto', f.projects.join(','));
	if (f.q.trim()) sp.set('q', f.q.trim());
	if (f.preset === 'rango') {
		if (f.from) sp.set('desde', f.from);
		if (f.to) sp.set('hasta', f.to);
	} else if (f.preset !== 'todo') sp.set('fechas', f.preset);
	const s = sp.toString();
	return s ? `?${s}` : '';
}

// ─── Respuesta del servidor ─────────────────────────────────────────────────

/** Fila del registro: la sesión y quién la validó (Fase 6). */
export type LogRow = WeekSession & {
	reviewed_by?: string | null;
	review_action?: 'validada' | 'corregida' | null;
};

export interface LogResult {
	total_count: number;
	total_minutes: number;
	by_member: { member_id: string; minutes: number; count: number }[];
	by_day: { day: string; minutes: number; count: number }[];
	rows: LogRow[];
}

export const emptyResult = (): LogResult => ({
	total_count: 0,
	total_minutes: 0,
	by_member: [],
	by_day: [],
	rows: []
});

/** Agrupa sesiones (ya ordenadas, más reciente primero) por día de Madrid. */
export function groupByDay<T extends WeekSession>(rows: T[]): { day: string; rows: T[] }[] {
	const out: { day: string; rows: T[] }[] = [];
	for (const s of rows) {
		const day = madridDateISO(new Date(s.started_at));
		const last = out[out.length - 1];
		if (last?.day === day) last.rows.push(s);
		else out.push({ day, rows: [s] });
	}
	return out;
}

// ─── Resaltado de lo buscado (sin distinguir tildes ni mayúsculas) ──────────

const fold = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Trozos de `text` marcando dónde aparece `q`. Igual que el servidor: sin tildes. */
export function highlight(text: string, q: string): { t: string; hit: boolean }[] {
	const needle = fold(q.trim());
	if (!needle) return [{ t: text, hit: false }];

	// Texto "plegado" + mapa de cada carácter plegado a su posición original.
	const chars = Array.from(text);
	let folded = '';
	const map: number[] = [];
	let pos = 0;
	for (const ch of chars) {
		const f = fold(ch);
		for (let k = 0; k < f.length; k++) map.push(pos);
		folded += f;
		pos += ch.length;
	}
	map.push(text.length);

	const out: { t: string; hit: boolean }[] = [];
	let cursor = 0;
	let from = 0;
	for (;;) {
		const i = folded.indexOf(needle, from);
		if (i < 0) break;
		const a = map[i];
		const b = map[i + needle.length];
		if (a > cursor) out.push({ t: text.slice(cursor, a), hit: false });
		out.push({ t: text.slice(a, b), hit: true });
		cursor = b;
		from = i + needle.length;
	}
	if (cursor < text.length) out.push({ t: text.slice(cursor), hit: false });
	return out.length ? out : [{ t: text, hit: false }];
}
