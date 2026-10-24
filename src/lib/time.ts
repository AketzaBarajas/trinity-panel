export const TZ = 'Europe/Madrid';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
	timeZone: TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23'
});

function madridParts(date: Date) {
	const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
	return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

/** Desfase de Madrid respecto a UTC en minutos para ese instante (60 o 120). */
function offsetMinutes(date: Date): number {
	const p = madridParts(date);
	const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
	return Math.round((asUtc - date.getTime()) / 60000);
}

/** Hora de pared de Madrid (y, m, d, h, min) como instante UTC. Tiene en cuenta el cambio de hora. */
export function madridTime(y: number, m: number, d: number, h = 0, min = 0): Date {
	const guess = Date.UTC(y, m - 1, d, h, min);
	const off = offsetMinutes(new Date(guess - 120 * 60000));
	const t = guess - off * 60000;
	// Segunda pasada por si el cambio de hora cae justo ese día.
	const off2 = offsetMinutes(new Date(t));
	return new Date(off2 === off ? t : guess - off2 * 60000);
}

/** Medianoche de Madrid de un día (y, m, d) como instante UTC. */
export function madridMidnight(y: number, m: number, d: number): Date {
	return madridTime(y, m, d);
}

/** "2026-10-24" (día en Madrid), el formato de <input type="date">. */
export function madridDateISO(date = new Date()): string {
	const p = madridParts(date);
	return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Medianoche de Madrid del día en que cae `date`. */
export function madridDayStart(date: Date): Date {
	const p = madridParts(date);
	return madridMidnight(p.y, p.m, p.d);
}

/** "2026-10-24" + "17:05" (hora de Madrid) → instante. null si no es válido. */
export function fromMadridInputs(day: string, time: string): Date | null {
	const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	const tm = /^(\d{2}):(\d{2})$/.exec(time);
	if (!dm || !tm) return null;
	return madridTime(+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]);
}

/** Suma días a "AAAA-MM-DD". */
export function addDaysISO(day: string, n: number): string {
	const [y, m, d] = day.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d + n));
	return t.toISOString().slice(0, 10);
}

export interface Week {
	start: Date; // lunes 00:00 Madrid
	end: Date; // lunes siguiente 00:00 Madrid
	days: Date[]; // 7 medianoches
	number: number;
}

export function currentWeek(now = new Date()): Week {
	const p = madridParts(now);
	const local = new Date(Date.UTC(p.y, p.m - 1, p.d));
	const dow = local.getUTCDay() || 7;
	local.setUTCDate(local.getUTCDate() - (dow - 1));
	const days = Array.from({ length: 8 }, (_, i) => {
		const d = new Date(local);
		d.setUTCDate(local.getUTCDate() + i);
		return madridMidnight(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
	});
	return { start: days[0], end: days[7], days: days.slice(0, 7), number: isoWeek(now) };
}

export function greeting(date = new Date()): string {
	const h = madridParts(date).h;
	if (h >= 6 && h < 14) return 'Buenos días';
	if (h >= 14 && h < 21) return 'Buenas tardes';
	return 'Buenas noches';
}

/** Semana ISO (lunes–domingo), la misma que usa el pacto. */
export function isoWeek(date = new Date()): number {
	const p = madridParts(date);
	const d = new Date(Date.UTC(p.y, p.m - 1, p.d));
	const day = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const shortFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: TZ });
const hmFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });
const dowFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'narrow', timeZone: TZ });
const relFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ });

/** "hoy", "ayer" o "jueves, 22 oct" */
export function relDay(date: Date, now = new Date()): string {
	const a = madridDateISO(date);
	const b = madridDateISO(now);
	if (a === b) return 'hoy';
	if (a === addDaysISO(b, -1)) return 'ayer';
	return relFmt.format(date).replace('.', '');
}

/** "Sábado, 24 de octubre" */
export function longDay(date = new Date()): string {
	const s = dayFmt.format(date);
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "20–26 oct" */
export function weekRange(w: Week): string {
	const a = shortFmt.format(w.start).replace('.', '');
	const last = new Date(w.end.getTime() - 3600_000);
	const b = shortFmt.format(last).replace('.', '');
	const [da, ma] = a.split(' ');
	const [db, mb] = b.split(' ');
	return ma === mb ? `${da}–${db} ${mb}` : `${a} – ${b}`;
}

export const hhmm = (d: Date) => hmFmt.format(d);
export const dayLetter = (d: Date) => dowFmt.format(d).toUpperCase();

/** 245 → "4h 05m"; 0 → "0h 00m" */
export function fmtHM(minutes: number): string {
	const m = Math.max(0, Math.round(minutes));
	return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** 245 → "4 h 5 min" para texto corrido */
export function fmtHuman(minutes: number): string {
	const m = Math.max(0, Math.round(minutes));
	const h = Math.floor(m / 60);
	const r = m % 60;
	if (!h) return `${r} min`;
	if (!r) return `${h} h`;
	return `${h} h ${r} min`;
}

/** segundos → "01:23:45" */
export function fmtClock(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return [h, m, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

const agoDateFmt = new Intl.DateTimeFormat('es-ES', {
	timeZone: TZ,
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit'
});

/** "hace un momento" · "hace 5 min" · "hace 3 h" · "el 24 oct, 13:05" */
export function ago(iso: string, now = Date.now()): string {
	const s = Math.max(0, (now - Date.parse(iso)) / 1000);
	if (s < 45) return 'hace un momento';
	if (s < 3600) return `hace ${Math.round(s / 60)} min`;
	if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
	return `el ${agoDateFmt.format(new Date(iso)).replace('.', '')}`;
}
