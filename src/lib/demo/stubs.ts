// Lo que Supabase trae de serie y un Postgres normal (PGlite) no: el esquema
// auth, los roles, la publicación de tiempo real, pg_net y pg_cron.
// Lo usan el modo demo (src/lib/demo/client.ts) y los tests (tests/).

export const SUPABASE_STUBS = `
	create schema auth; create schema extensions;
	create table auth.users (id uuid primary key, raw_user_meta_data jsonb, created_at timestamptz default now());
	create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('demo.uid', true), '')::uuid $$;
	create role authenticated; create role anon;
	create publication supabase_realtime;
	create schema net;
	create table net._http_response (id bigint, status_code int, error_msg text, timed_out bool);
	create table net.requests (id bigserial primary key, url text, body jsonb);
	create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
		returns bigint language sql as $$ insert into net.requests (url, body) values (url, body) returning id $$;
	create schema cron;
	create table cron.job (jobid serial primary key, jobname text, schedule text, command text);
	create function cron.schedule(n text, s text, c text) returns int language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
	create function cron.unschedule(id int) returns bool language sql as $$ delete from cron.job where jobid = id returning true $$;
`;

/** Adapta una migración a PGlite (extensiones que no tiene). */
export function patchMigration(sql: string): string {
	return sql
		.replace(
			'create extension if not exists unaccent with schema extensions;',
			"create function extensions.unaccent(d text, t text) returns text language sql immutable as $x$ select translate(t, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN') $x$;"
		)
		.replace('create extension if not exists pg_net;', '')
		.replace('create extension if not exists pg_cron;', '');
}
