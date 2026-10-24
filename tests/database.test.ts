// Tests de la base de datos: aplica TODAS las migraciones de supabase/ en un
// Postgres en memoria (PGlite), carga los datos del modo demo y comprueba las
// reglas del pacto, el cronómetro, las ausencias y los avisos de Discord.
//
//   npm test

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { SUPABASE_STUBS, patchMigration } from '../src/lib/demo/stubs.ts';
import { seedSQL, DEMO_USER, MARCO, NORA } from '../src/lib/demo/seed.ts';

const MIGRATIONS = join(import.meta.dirname, '..', 'supabase', 'migrations');

let db: PGlite;

async function as(uid: string) {
	await db.exec(`set demo.uid = '${uid}'`);
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
	return (await db.query<T>(sql, params)).rows[0];
}

async function fails(sql: string, code: string) {
	await assert.rejects(db.query(sql), (e: Error) => e.message.includes(code));
}

before(async () => {
	db = new PGlite({ extensions: { btree_gist } });
	await db.exec(SUPABASE_STUBS);
	for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
		await db.exec(patchMigration(readFileSync(join(MIGRATIONS, f), 'utf8')));
	}
	await db.exec(seedSQL());
	await as(DEMO_USER);
});

describe('pact rules (pact_status)', () => {
	type Week = { week_start: string; status: string; strike: number | null; target: number };
	const weeks = async (member: string) =>
		(
			await db.query<Week>(
				`select week_start::text, status, strike, target from public.pact_status() where member_id = $1 order by week_start`,
				[member]
			)
		).rows;

	test('a short week made up the following week is "recuperada"', async () => {
		assert.equal((await weeks(MARCO))[2].status, 'recuperada');
	});

	test('a short week that is not made up is the first warning ("toque")', async () => {
		const w = (await weeks(MARCO))[6];
		assert.equal(w.status, 'toque');
		assert.equal(w.strike, 1);
	});

	test('a whole week of justified absence is "justificada" and needs 0 h', async () => {
		const w = (await weeks(NORA))[3];
		assert.equal(w.status, 'justificada');
		assert.equal(w.target, 0);
	});

	test('the current week is "en_curso" for everybody', async () => {
		for (const m of [DEMO_USER, MARCO, NORA]) assert.equal((await weeks(m)).at(-1)!.status, 'en_curso');
	});
});

describe('stopwatch', () => {
	test('only one running stopwatch per member', async () => {
		await as(MARCO); // ya tiene uno en marcha en los datos demo
		await fails('select public.start_session()', 'trinity_already_running');
		await as(DEMO_USER);
	});

	test('stopping before 1 minute deletes the session', async () => {
		await as(NORA);
		const { id } = await one<{ id: string }>('select (public.start_session()).id');
		const stopped = await one<{ s: unknown }>('select public.stop_session() as s');
		assert.equal(stopped.s, null);
		assert.equal((await one<{ n: number }>('select count(*)::int n from public.sessions where id = $1', [id])).n, 0);
		await as(DEMO_USER);
	});

	test('manual hours are flagged for review', async () => {
		const r = await one<{ is_manual: boolean; needs_review: boolean }>(
			`select is_manual, needs_review from public.add_manual_session(
			   now() - interval '3 hours 10 minutes', now() - interval '3 hours', 'Test', '{web}')`
		);
		assert.deepEqual(r, { is_manual: true, needs_review: true });
	});

	test('nobody reviews their own sessions', async () => {
		const { id } = await one<{ id: string }>(
			`select id from public.sessions where member_id = $1 and needs_review limit 1`,
			[DEMO_USER]
		);
		await fails(`select public.review_session('${id}')`, 'trinity_review_own');
	});
});

describe('absences', () => {
	test('exams must be announced 48 h in advance', async () => {
		await fails(`select public.add_absence(current_date + 1, current_date + 1, 'examenes')`, 'trinity_absence_late');
	});

	test('"otro" is not a valid reason for yourself', async () => {
		await fails(`select public.add_absence(current_date + 5, current_date + 5, 'otro')`, 'trinity_absence_other');
	});
});

describe('discord notifications', () => {
	test('each notice is sent once, however many ticks run', async () => {
		await db.exec('select private.discord_tick(); select private.discord_tick();');
		const dupes = await one<{ n: number }>(
			`select count(*)::int n from (select body from net.requests group by body having count(*) > 1) d`
		);
		assert.equal(dupes.n, 0);
		const started = await one<{ n: number }>(`select count(*)::int n from private.discord_log where key like 'inicio:%' and key <> 'inicio:demo'`);
		assert.ok(started.n >= 1);
	});

	test('the webhook URL cannot be set to a non-Discord address', async () => {
		await fails(`select public.set_discord_webhook('https://example.com/hook')`, 'trinity_bad_webhook');
	});
});
