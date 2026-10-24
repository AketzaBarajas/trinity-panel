// Modo demo (solo en `npm run dev`, abriendo la web con `?demo`).
//
// Sustituye a Supabase por un Postgres que corre en el navegador (PGlite) con
// las MISMAS migraciones de `supabase/migrations/` y datos inventados. Así se
// puede probar la web sin backend y sacar capturas sin datos reales: todo lo
// que se ve (gráficas, pacto, registro) lo calcula el SQL de verdad.
//
// Imita solo la parte de supabase-js que usa esta web: select con columnas y
// relaciones, filtros eq/neq/gt/gte/lt/lte/is/not/or, order, limit,
// single/maybeSingle, update, rpc, auth y canales de tiempo real (mudos).

import type { PGlite } from '@electric-sql/pglite';
import { seedSQL, DEMO_USER } from './seed.ts';
import { SUPABASE_STUBS, patchMigration } from './stubs.ts';

type Lit = string | number | boolean | null | undefined | unknown[];
type Result = { data: unknown; error: { message: string; code?: string } | null };

let dbPromise: Promise<PGlite> | null = null;

function db(): Promise<PGlite> {
	dbPromise ??= open();
	return dbPromise;
}

async function open(): Promise<PGlite> {
	const [{ PGlite }, { btree_gist }] = await Promise.all([
		import('@electric-sql/pglite'),
		import('@electric-sql/pglite/contrib/btree_gist')
	]);
	const pg = new PGlite({ extensions: { btree_gist } });

	await pg.exec(SUPABASE_STUBS);

	const files = import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default' });
	for (const path of Object.keys(files).sort()) {
		await pg.exec(patchMigration((await files[path]()) as string));
	}

	await pg.exec(seedSQL());
	await pg.exec(`set demo.uid = '${DEMO_USER}'`);
	return pg;
}

// ─── SQL helpers ────────────────────────────────────────────────────────────

const ident = (s: string) => {
	if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`demo: identificador raro ${s}`);
	return s;
};

function lit(v: Lit): string {
	if (v === null || v === undefined) return 'null';
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	if (typeof v === 'number') return String(v);
	if (Array.isArray(v)) return lit(`{${v.map((x) => `"${String(x).replace(/["\\]/g, '\\$&')}"`).join(',')}}`);
	return `'${String(v).replace(/'/g, "''")}'`;
}

// Relaciones que la web pide dentro de un select.
const EMBEDS: Record<string, (alias: string, cols: string[]) => string> = {
	session_specialties: (_a, cols) =>
		`(select coalesce(jsonb_agg(jsonb_build_object(${cols.map((c) => `'${c}', x.${ident(c)}`).join(', ')})), '[]'::jsonb)
		    from public.session_specialties x where x.session_id = t.id)`,
	members: (_a, cols) =>
		`(select jsonb_build_object(${cols.map((c) => `'${c}', m.${ident(c)}`).join(', ')})
		    from public.members m where m.id = t.taken_by)`
};

function selectList(spec: string): string {
	if (spec.trim() === '*') return 't.*';
	// Separa por comas que no estén dentro de paréntesis.
	const parts: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of spec) {
		if (ch === '(') depth++;
		if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			parts.push(cur.trim());
			cur = '';
		} else cur += ch;
	}
	if (cur.trim()) parts.push(cur.trim());

	return parts
		.map((p) => {
			const m = /^(?:(\w+):)?(\w+)\((.*)\)$/.exec(p);
			if (!m) return `t.${ident(p)}`;
			const [, alias, rel, inner] = m;
			const make = EMBEDS[rel];
			if (!make) throw new Error(`demo: relación no soportada ${rel}`);
			return `${make(alias ?? rel, inner.split(',').map((c) => c.trim()))} as ${ident(alias ?? rel)}`;
		})
		.join(', ');
}

const OPS: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

function cond(col: string, op: string, value: Lit): string {
	const c = `t.${ident(col)}`;
	if (op === 'is') return `${c} is ${value === null || value === 'null' ? 'null' : lit(value)}`;
	if (OPS[op]) return `${c} ${OPS[op]} ${lit(value)}`;
	throw new Error(`demo: operador no soportado ${op}`);
}

// ─── Query builder (thenable, como el de supabase-js) ───────────────────────

class Query implements PromiseLike<Result> {
	#table: string;
	#cols = '*';
	#where: string[] = [];
	#order: string[] = [];
	#limit: number | null = null;
	#mode: 'many' | 'single' | 'maybe' = 'many';
	#update: Record<string, Lit> | null = null;

	constructor(table: string) {
		this.#table = ident(table);
	}

	select(cols = '*') {
		this.#cols = cols;
		return this;
	}
	update(values: Record<string, Lit>) {
		this.#update = values;
		return this;
	}
	eq(c: string, v: Lit) {
		this.#where.push(cond(c, 'eq', v));
		return this;
	}
	neq(c: string, v: Lit) {
		this.#where.push(cond(c, 'neq', v));
		return this;
	}
	gt(c: string, v: Lit) {
		this.#where.push(cond(c, 'gt', v));
		return this;
	}
	gte(c: string, v: Lit) {
		this.#where.push(cond(c, 'gte', v));
		return this;
	}
	lt(c: string, v: Lit) {
		this.#where.push(cond(c, 'lt', v));
		return this;
	}
	lte(c: string, v: Lit) {
		this.#where.push(cond(c, 'lte', v));
		return this;
	}
	is(c: string, v: Lit) {
		this.#where.push(cond(c, 'is', v));
		return this;
	}
	not(c: string, op: string, v: Lit) {
		this.#where.push(`not (${cond(c, op, v)})`);
		return this;
	}
	/** "ended_at.gt.2026-10-19T22:00:00.000Z,ended_at.is.null" */
	or(expr: string) {
		const parts = expr.split(',').map((p) => {
			const [col, op, ...rest] = p.split('.');
			const v = rest.join('.');
			return cond(col, op, op === 'is' ? (v === 'null' ? null : v) : v);
		});
		this.#where.push(`(${parts.join(' or ')})`);
		return this;
	}
	order(c: string, opts?: { ascending?: boolean }) {
		this.#order.push(`t.${ident(c)} ${opts?.ascending === false ? 'desc' : 'asc'}`);
		return this;
	}
	limit(n: number) {
		this.#limit = n;
		return this;
	}
	single() {
		this.#mode = 'single';
		return this;
	}
	maybeSingle() {
		this.#mode = 'maybe';
		return this;
	}

	async #run(): Promise<Result> {
		const pg = await db();
		const where = this.#where.length ? `where ${this.#where.join(' and ')}` : '';
		try {
			if (this.#update) {
				const set = Object.entries(this.#update)
					.map(([k, v]) => `${ident(k)} = ${lit(v)}`)
					.join(', ');
				await pg.exec(`update public.${this.#table} t set ${set} ${where}`);
				return { data: null, error: null };
			}
			const sql = `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as j from (
				select ${selectList(this.#cols)} from public.${this.#table} t ${where}
				${this.#order.length ? `order by ${this.#order.join(', ')}` : ''}
				${this.#limit !== null ? `limit ${this.#limit}` : ''}) r`;
			const rows = ((await pg.query<{ j: unknown[] }>(sql)).rows[0]?.j ?? []) as unknown[];
			if (this.#mode === 'many') return { data: rows, error: null };
			if (this.#mode === 'single' && rows.length !== 1)
				return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
			return { data: rows[0] ?? null, error: null };
		} catch (e) {
			return { data: null, error: { message: (e as Error).message } };
		}
	}

	then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
		return this.#run().then(ok, bad);
	}
}

// ─── RPC ────────────────────────────────────────────────────────────────────

async function rpc(name: string, args: Record<string, Lit> = {}): Promise<Result> {
	const pg = await db();
	try {
		const info = (
			await pg.query<{ retset: boolean; void: boolean }>(
				`select p.proretset as retset, p.prorettype = 'void'::regtype as void
				   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = $1 limit 1`,
				[ident(name)]
			)
		).rows[0];
		if (!info) return { data: null, error: { message: `function ${name} not found`, code: 'PGRST202' } };

		const call = `public.${name}(${Object.entries(args)
			.map(([k, v]) => `${ident(k)} => ${lit(v)}`)
			.join(', ')})`;

		if (info.void) {
			await pg.query(`select ${call}`);
			return { data: null, error: null };
		}
		const sql = info.retset
			? `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as j from ${call} r`
			: `select to_jsonb(${call}) as j`;
		return { data: (await pg.query<{ j: unknown }>(sql)).rows[0]?.j ?? null, error: null };
	} catch (e) {
		return { data: null, error: { message: (e as Error).message } };
	}
}

// ─── Cliente ────────────────────────────────────────────────────────────────

export function createDemoClient() {
	const session = {
		access_token: 'demo',
		user: { id: DEMO_USER, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' }
	};
	const channel = {
		on() {
			return channel;
		},
		subscribe() {
			return channel;
		}
	};

	// Arranca la base en cuanto se carga la web.
	void db();

	return {
		from: (table: string) => new Query(table),
		rpc,
		channel: () => channel,
		removeChannel: async () => 'ok',
		auth: {
			getSession: async () => (await db(), { data: { session }, error: null }),
			onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
			signInWithOAuth: async () => ({ data: null, error: null }),
			signOut: async () => ({ error: null })
		}
	};
}
