import { supabase } from './supabase.ts';
import { team } from './team.svelte.ts';
import { madridDateISO, addDaysISO } from './time.ts';

export type PeriodKey = 'semana' | 'mes' | 'ano' | 'todo';

export const PERIODS: { key: PeriodKey; label: string }[] = [
	{ key: 'semana', label: 'Semana' },
	{ key: 'mes', label: 'Mes' },
	{ key: 'ano', label: 'Año' },
	{ key: 'todo', label: 'Todo' }
];

export interface DayRow {
	day: string;
	member_id: string;
	minutes: number;
}
export interface HourRow {
	dow: number;
	hour: number;
	member_id: string;
	minutes: number;
}
export interface SpecRow {
	specialty_slug: string;
	member_id: string;
	minutes: number;
}

export type Grain = 'day' | 'week' | 'month';

export interface Bucket {
	key: string;
	from: string;
	to: string;
	/** Etiqueta larga para el tooltip y la tabla. */
	label: string;
	/** Etiqueta corta del eje (null = sin etiqueta en esa columna). */
	tick: string | null;
	future: boolean;
	current: boolean;
}

export interface Range {
	period: PeriodKey;
	from: string;
	to: string;
	grain: Grain;
	buckets: Bucket[];
	/** Días ya transcurridos del periodo (para el mínimo proporcional). */
	elapsedDays: number;
	title: string;
}

// ─── Fechas (todo en "AAAA-MM-DD" de Madrid) ───────────────────────────────

const utc = (d: string) => new Date(`${d}T12:00:00Z`);
const dow = (d: string) => utc(d).getUTCDay() || 7;
export const weekStartISO = (d: string) => addDaysISO(d, 1 - dow(d));
const daysBetween = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
const lastOfMonth = (d: string) => {
	const t = utc(d);
	return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DOW_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const dayNum = (d: string) => +d.slice(8, 10);
const monthIdx = (d: string) => +d.slice(5, 7) - 1;
export const longDate = (d: string) => `${DOW_LONG[dow(d) - 1]} ${dayNum(d)} ${MONTHS[monthIdx(d)]}`;

function days(from: string, to: string): string[] {
	const out: string[] = [];
	for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
	return out;
}

function rangeFor(period: PeriodKey, today: string, firstDay: string | null): Range {
	const mk = (from: string, to: string, grain: Grain, title: string): Range => {
		const buckets: Bucket[] = [];
		if (grain === 'day') {
			for (const d of days(from, to)) {
				const n = dayNum(d);
				buckets.push({
					key: d,
					from: d,
					to: d,
					label: longDate(d),
					tick: period === 'semana' ? `${DOW[dow(d) - 1]} ${n}` : n === 1 || n % 5 === 0 ? String(n) : null,
					future: d > today,
					current: d === today
				});
			}
		} else if (grain === 'week') {
			for (let w = weekStartISO(from); w <= to; w = addDaysISO(w, 7)) {
				const end = addDaysISO(w, 6);
				// Etiqueta de mes en la semana que contiene el día 1.
				const first = days(w, end).find((d) => dayNum(d) === 1);
				buckets.push({
					key: w,
					from: w,
					to: end,
					label: `Semana del ${dayNum(w)} ${MONTHS[monthIdx(w)]} al ${dayNum(end)} ${MONTHS[monthIdx(end)]}`,
					tick: first ? MONTHS[monthIdx(first)] : null,
					future: w > today,
					current: w <= today && today <= end
				});
			}
		} else {
			for (let m = from.slice(0, 7) + '-01'; m <= to; m = addDaysISO(lastOfMonth(m), 1)) {
				buckets.push({
					key: m.slice(0, 7),
					from: m,
					to: lastOfMonth(m),
					label: `${MONTHS_LONG[monthIdx(m)]} ${m.slice(0, 4)}`,
					tick: monthIdx(m) === 0 ? m.slice(0, 4) : MONTHS[monthIdx(m)],
					future: m > today,
					current: m.slice(0, 7) === today.slice(0, 7)
				});
			}
		}
		const qFrom = buckets[0]?.from ?? from;
		const qTo = buckets.at(-1)?.to ?? to;
		const elapsedDays = Math.max(1, Math.min(daysBetween(qFrom, today), daysBetween(qFrom, qTo)) + 1);
		return { period, from: qFrom, to: qTo, grain, buckets, elapsedDays, title };
	};

	if (period === 'semana') {
		const w = weekStartISO(today);
		return mk(w, addDaysISO(w, 6), 'day', 'Esta semana');
	}
	if (period === 'mes') {
		const m = today.slice(0, 7) + '-01';
		return mk(m, lastOfMonth(m), 'day', `${MONTHS_LONG[monthIdx(m)]} ${m.slice(0, 4)}`);
	}
	if (period === 'ano') {
		const y = today.slice(0, 4);
		return mk(`${y}-01-01`, `${y}-12-31`, 'week', `Año ${y}`);
	}
	const start = weekStartISO(firstDay ?? today);
	const end = addDaysISO(weekStartISO(today), 6);
	const grain: Grain = daysBetween(start, end) > 7 * 104 ? 'month' : 'week';
	return mk(start, end, grain, 'Desde el principio');
}

// ─── Almacén ───────────────────────────────────────────────────────────────

const CAL_WEEKS = 53;

class Stats {
	period = $state<PeriodKey>('semana');
	range = $state<Range>(rangeFor('semana', madridDateISO(), null));
	daily = $state<DayRow[]>([]);
	hourly = $state<HourRow[]>([]);
	specs = $state<SpecRow[]>([]);
	/** Últimas 53 semanas, para el calendario de constancia. */
	calendar = $state<DayRow[]>([]);
	calFrom = $state('');
	today = $state(madridDateISO());
	loading = $state(true);
	error = $state(false);

	#firstDay: string | null | undefined = undefined;
	#seq = 0;

	/** Columnas del gráfico grande: minutos por persona en cada tramo. */
	columns = $derived.by(() => {
		const { buckets, grain } = this.range;
		const keyOf = (d: string) => (grain === 'day' ? d : grain === 'week' ? weekStartISO(d) : d.slice(0, 7));
		const idx = new Map(buckets.map((b, i) => [b.key, i]));
		const per = buckets.map(() => new Map<string, number>());
		for (const r of this.daily) {
			const i = idx.get(keyOf(r.day));
			if (i === undefined) continue;
			per[i].set(r.member_id, (per[i].get(r.member_id) ?? 0) + r.minutes);
		}
		return buckets.map((b, i) => ({
			...b,
			per: per[i],
			total: [...per[i].values()].reduce((t, v) => t + v, 0)
		}));
	});

	/** Minutos de cada persona en el periodo. */
	totals = $derived.by(() => {
		const out = new Map<string, number>();
		for (const r of this.daily) out.set(r.member_id, (out.get(r.member_id) ?? 0) + r.minutes);
		return out;
	});

	/** Mínimo que "toca" en el periodo: el semanal, o proporcional a los días pasados. */
	expected = $derived(
		this.range.period === 'semana' ? team.minMinutes : (team.minMinutes * this.range.elapsedDays) / 7
	);

	setPeriod(p: PeriodKey) {
		if (p === this.period) return;
		this.period = p;
		void this.refresh();
	}

	async refresh() {
		const seq = ++this.#seq;
		const today = madridDateISO(new Date(Date.now() + team.skew));

		if (this.period === 'todo' && this.#firstDay === undefined) {
			const { data } = await supabase.from('sessions').select('started_at').order('started_at').limit(1);
			this.#firstDay = data?.[0] ? madridDateISO(new Date(data[0].started_at)) : null;
		}

		const r = rangeFor(this.period, today, this.#firstDay ?? null);
		const calFrom = weekStartISO(addDaysISO(today, -7 * (CAL_WEEKS - 1)));
		const args = { p_from: r.from, p_to: r.to };

		const [d, h, s, c] = await Promise.all([
			supabase.rpc('daily_minutes', args),
			supabase.rpc('hourly_minutes', args),
			supabase.rpc('specialty_minutes', args),
			supabase.rpc('daily_minutes', { p_from: calFrom, p_to: today })
		]);
		if (seq !== this.#seq) return;

		this.error = !!(d.error || h.error || s.error || c.error);
		if (this.error) console.error('[stats]', d.error ?? h.error ?? s.error ?? c.error);

		const num = <T extends { minutes: unknown }>(rows: T[] | null) =>
			(rows ?? []).map((x) => ({ ...x, minutes: Number(x.minutes) }));
		this.today = today;
		this.range = r;
		this.daily = num(d.data as DayRow[] | null);
		this.hourly = num(h.data as HourRow[] | null);
		this.specs = num(s.data as SpecRow[] | null);
		this.calendar = num(c.data as DayRow[] | null);
		this.calFrom = calFrom;
		this.loading = false;
	}
}

export const stats = new Stats();
export { DOW, DOW_LONG, MONTHS };
