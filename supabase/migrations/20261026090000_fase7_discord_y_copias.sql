-- ============================================================================
-- trinity-panel · Fase 7 · Avisos de Discord + copia de seguridad semanal
-- ----------------------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor (después de la Fase 6).
--
-- Discord (decisión D11 de la planificación):
--   · Todo sale de la base de datos con pg_net (peticiones HTTP) y pg_cron
--     (un "tic" cada minuto). No hace falta ningún servidor más.
--   · La URL del webhook es un secreto: vive en el esquema `private`, que el
--     navegador no puede leer. Solo el admin principal la cambia (Ajustes).
--   · Inicio de sesión: se avisa cuando lleva 1 minuto en marcha (así un clic
--     sin querer, que se borra al parar, nunca llega a Discord).
--   · Fin de sesión: se avisa cuando ya tiene frase ("¿Qué has hecho?").
--   · Domingo a las 21:00 (hora de Madrid): resumen de la semana.
--   · Jueves a las 18:00: recordatorio a quien vaya por debajo del 50 % de su
--     objetivo de la semana (mínimo − ausencias + lo que tiene que recuperar).
--   · Cada aviso se manda una sola vez (registro `private.discord_log`).
--
-- Copia de seguridad (extra de v1, D14):
--   · Lunes de madrugada, foto completa de todas las tablas en `backups`.
--   · Se guardan las 12 últimas de cada tipo (semanal / manual).
--   · Los admins las descargan en JSON desde Ajustes.
-- ============================================================================


-- ─── Extensiones ────────────────────────────────────────────────────────────

create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;


-- ─── El pacto empieza limpio el lunes 26 oct (se adelantó para probar) ─────

update public.app_settings
   set pact_starts_on = date '2026-10-26'
 where id and pact_starts_on < date '2026-10-26';


-- ─── Ajustes de los avisos (los admins los encienden y apagan) ─────────────

alter table public.app_settings
  add column if not exists discord_sessions boolean not null default true,
  add column if not exists discord_weekly   boolean not null default true,
  add column if not exists discord_reminder boolean not null default true;

grant update (discord_sessions, discord_weekly, discord_reminder) on public.app_settings to authenticated;


-- ─── Secreto y registro de envíos (no visibles desde el navegador) ─────────

create table if not exists private.discord_webhook (
  id     boolean primary key default true check (id),
  url    text not null,
  set_by uuid references public.members (id) on delete set null,
  set_at timestamptz not null default now()
);

create table if not exists private.discord_log (
  key        text primary key,
  kind       text not null,
  request_id bigint,
  sent_at    timestamptz not null default now()
);

create index if not exists discord_log_sent_idx on private.discord_log (sent_at desc);


-- ─── Formato (todo en español y en hora de Madrid) ─────────────────────────

-- 245 → "4h 05m"
create or replace function private.fmt_hm(p numeric)
returns text
language sql immutable set search_path = ''
as $$
  select (greatest(0, round(coalesce(p, 0)))::int / 60)::text || 'h '
      || lpad((greatest(0, round(coalesce(p, 0)))::int % 60)::text, 2, '0') || 'm';
$$;

-- 2026-10-26 → "26 oct"
create or replace function private.fmt_day(p date)
returns text
language sql immutable set search_path = ''
as $$
  select extract(day from p)::int::text || ' '
      || (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from p)::int];
$$;

-- hora local "17:02"
create or replace function private.fmt_time(p timestamptz)
returns text
language sql stable set search_path = ''
as $$
  select to_char(p at time zone 'Europe/Madrid', 'HH24:MI');
$$;

-- "#3A70F0" → color entero para Discord (turquesa si no hay color)
create or replace function private.hex_int(p text)
returns int
language sql immutable set search_path = ''
as $$
  select case when p ~* '^#[0-9a-f]{6}$' then ('x' || substr(p, 2))::bit(24)::int else 3003583 end;
$$;

-- "💻 Página web · ✍️ Creación de contenido"
create or replace function private.session_specs(p_session uuid)
returns text
language sql stable set search_path = ''
as $$
  select string_agg(sp.emoji || ' ' || sp.name, ' · ' order by sp.sort)
    from public.session_specialties x
    join public.specialties sp on sp.slug = x.specialty_slug
   where x.session_id = p_session;
$$;


-- ─── Enviar a Discord (una vez por clave) ──────────────────────────────────

create or replace function private.discord_post(p_key text, p_kind text, p_payload jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_id  bigint;
begin
  if p_payload is null then
    return false;
  end if;
  select url into v_url from private.discord_webhook where id;
  if v_url is null then
    return false;
  end if;

  insert into private.discord_log (key, kind) values (p_key, p_kind)
  on conflict (key) do nothing;
  if not found then
    return false; -- ya enviado
  end if;

  -- pg_net encola la petición y la manda al confirmar la transacción.
  v_id := net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
                 'username', 'trinity-panel',
                 'avatar_url', 'https://trinity-panel.pages.dev/icons/icon-192.png',
                 'allowed_mentions', '{"parse": []}'::jsonb
               ) || p_payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 8000
  );

  update private.discord_log set request_id = v_id where key = p_key;
  return true;
end;
$$;


-- ─── Mensajes ──────────────────────────────────────────────────────────────

create or replace function private.discord_start_payload(p_session uuid)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
           'color', private.hex_int(m.color),
           'description', format('🟢 **%s** ha empezado a trabajar · %s', m.display_name, p.name),
           'footer', jsonb_build_object('text', 'Desde las ' || private.fmt_time(s.started_at))
         )))
    from public.sessions s
    join public.members  m on m.id = s.member_id
    join public.projects p on p.id = s.project_id
   where s.id = p_session;
$$;

create or replace function private.discord_stop_payload(p_session uuid)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
           'color', private.hex_int(m.color),
           'description',
             case when s.is_manual
               then format('📝 **%s** ha añadido horas a mano · **%s** · %s', m.display_name, private.fmt_hm(d.mins), p.name)
               else format('✅ **%s** ha terminado · **%s** · %s', m.display_name, private.fmt_hm(d.mins), p.name)
             end
             || E'\n> ' || replace(s.title, E'\n', ' ')
             || coalesce(E'\n' || private.session_specs(s.id), ''),
           'footer', jsonb_build_object('text',
             case when s.is_manual
               then (array['lun','mar','mié','jue','vie','sáb','dom'])[extract(isodow from s.started_at at time zone 'Europe/Madrid')::int]
                    || ' ' || private.fmt_day((s.started_at at time zone 'Europe/Madrid')::date) || ' · '
               else ''
             end
             || private.fmt_time(s.started_at) || ' – ' || private.fmt_time(s.ended_at)
             || case
                  when s.is_manual then ' · por validar'
                  when s.needs_review then ' · corte automático, por validar'
                  else ''
                end)
         )))
    from public.sessions s
    join public.members  m on m.id = s.member_id
    join public.projects p on p.id = s.project_id
    cross join lateral (select extract(epoch from s.ended_at - s.started_at) / 60 as mins) d
   where s.id = p_session and s.ended_at is not null and s.title is not null;
$$;

-- Resumen de una semana (lunes p_week). Pensado para el domingo por la noche:
-- dice cómo va cada uno y qué pasa si no hay más horas antes de medianoche.
create or replace function private.discord_weekly_payload(p_week date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r          record;
  v_lines    text := '';
  v_pos      int := 0;
  v_need     int;
  v_line     text;
  v_total    numeric := 0;
  v_count    int;
  v_top      text;
  v_next_min int := public.minimum_for(p_week + 7);
begin
  for r in
    with ps as (select * from public.pact_status())
    select cur.*, m.display_name,
           (select count(*) from ps q
             where q.member_id = cur.member_id and q.week_start < p_week
               and q.status in ('toque', 'penalizacion'))::int as strikes
      from ps cur
      join public.members m on m.id = cur.member_id
     where cur.week_start = p_week
     order by cur.minutes desc, m.display_name
  loop
    v_pos   := v_pos + 1;
    v_total := v_total + r.minutes;
    v_need  := r.target + r.carry;

    v_line := case v_pos when 1 then '🥇' when 2 then '🥈' when 3 then '🥉' else '▫️' end
           || format(' **%s** — %s / %s · ', r.display_name, private.fmt_hm(r.minutes), private.fmt_hm(v_need));

    if r.absent >= 7 then
      v_line := v_line || '🟡 semana justificada';
    elsif r.minutes >= v_need then
      v_line := v_line || '✅ cumple'
             || case when r.carry > 0 then ' y recupera la semana pasada' else '' end;
    elsif r.minutes >= r.target then
      v_line := v_line || format('⚠️ cumple esta semana, pero le faltan %s para recuperar la pasada (%s)',
                                 private.fmt_hm(v_need - r.minutes),
                                 case when r.strikes = 0 then 'sería toque de atención' else 'sería penalización' end);
    else
      v_line := v_line || format('❌ le faltan %s', private.fmt_hm(v_need - r.minutes))
             || case
                  when r.carry > 0 then
                    format(' (y no recupera la pasada: %s)',
                           case when r.strikes = 0 then 'toque de atención' else 'penalización' end)
                  else format(' → la que viene necesitaría %s',
                              private.fmt_hm(v_next_min + (r.target - r.minutes)))
                end;
    end if;

    if r.review > 0 then
      v_line := v_line || format(' · %s por validar', private.fmt_hm(r.review));
    end if;

    v_lines := v_lines || v_line || E'\n';
  end loop;

  if v_pos = 0 then
    return null; -- el pacto aún no ha empezado
  end if;

  select count(*) into v_count
    from public.sessions s
   where s.started_at >= p_week::timestamp at time zone 'Europe/Madrid'
     and s.started_at <  (p_week + 7)::timestamp at time zone 'Europe/Madrid';

  select sp.emoji || ' ' || sp.name || ' (' || private.fmt_hm(sum(extract(epoch from coalesce(s.ended_at, now()) - s.started_at) / 60)) || ')'
    into v_top
    from public.sessions s
    join public.session_specialties x on x.session_id = s.id
    join public.specialties sp on sp.slug = x.specialty_slug
   where s.started_at >= p_week::timestamp at time zone 'Europe/Madrid'
     and s.started_at <  (p_week + 7)::timestamp at time zone 'Europe/Madrid'
   group by sp.slug, sp.emoji, sp.name
   order by sum(extract(epoch from coalesce(s.ended_at, now()) - s.started_at)) desc
   limit 1;

  return jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
    'color', 3003583,
    'title', format('🔺 Semana %s · %s', extract(week from p_week)::int,
                    case when extract(month from p_week) = extract(month from p_week + 6)
                         then extract(day from p_week)::int || '–' || private.fmt_day(p_week + 6)
                         else private.fmt_day(p_week) || ' – ' || private.fmt_day(p_week + 6)
                    end),
    'url', 'https://trinity-panel.pages.dev/pacto',
    'description', v_lines
      || E'\n**Equipo:** ' || private.fmt_hm(v_total) || ' · ' || v_count
      || case when v_count = 1 then ' sesión' else ' sesiones' end
      || coalesce(' · lo que más: ' || v_top, ''),
    'footer', jsonb_build_object('text', 'La semana se cierra a medianoche. Lo que no está en el registro no cuenta.')
  )));
end;
$$;

-- Recordatorio del jueves: menciona a quien vaya por debajo del 50 %.
create or replace function private.discord_reminder_payload(p_week date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r       record;
  v_lines text := '';
  v_ids   jsonb := '[]'::jsonb;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_left  int := greatest(1, 8 - extract(isodow from v_today)::int);
  v_need  int;
begin
  for r in
    select ps.*, m.display_name, m.discord_id
      from public.pact_status() ps
      join public.members m on m.id = ps.member_id
     where ps.week_start = p_week
       and ps.absent < 7
       and ps.target + ps.carry > 0
       and ps.minutes < (ps.target + ps.carry) * 0.5
     order by m.display_name
  loop
    v_need  := r.target + r.carry;
    v_ids   := v_ids || to_jsonb(r.discord_id);
    v_lines := v_lines || format(E'<@%s> llevas **%s** de %s (%s %%). Te faltan %s y quedan %s días.\n',
                                 r.discord_id, private.fmt_hm(r.minutes), private.fmt_hm(v_need),
                                 floor(r.minutes * 100 / v_need)::int,
                                 private.fmt_hm(v_need - r.minutes), v_left);
  end loop;

  if jsonb_array_length(v_ids) = 0 then
    return null; -- todos van por encima del 50 %
  end if;

  return jsonb_build_object(
    'content', E'⏰ **Recordatorio del jueves**\n' || v_lines,
    'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb, 'users', v_ids)
  );
end;
$$;


-- ─── El tic de cada minuto ──────────────────────────────────────────────────

create or replace function private.discord_tick()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_since  timestamptz;
  st       public.app_settings;
  r        record;
  v_local  timestamp := now() at time zone 'Europe/Madrid';
  v_today  date := (now() at time zone 'Europe/Madrid')::date;
  v_dow    int := extract(isodow from (now() at time zone 'Europe/Madrid'))::int;
  v_monday date := (now() at time zone 'Europe/Madrid')::date
                   - (extract(isodow from (now() at time zone 'Europe/Madrid'))::int - 1);
begin
  select set_at into v_since from private.discord_webhook where id;
  if v_since is null then
    return; -- Discord sin configurar
  end if;
  select * into st from public.app_settings where id;

  -- Cada bloque por separado: si uno falla, los demás siguen.
  if st.discord_sessions then
    begin
      for r in
        select s.id from public.sessions s
         where s.ended_at is null and not s.is_manual
           and s.created_at >= v_since
           and s.started_at <= now() - interval '1 minute'
           and not exists (select 1 from private.discord_log l
                            where l.key in ('inicio:' || s.id, 'fin:' || s.id))
         order by s.started_at
      loop
        perform private.discord_post('inicio:' || r.id, 'inicio', private.discord_start_payload(r.id));
      end loop;

      for r in
        select s.id from public.sessions s
         where s.ended_at is not null and s.title is not null
           and s.created_at >= v_since
           and not exists (select 1 from private.discord_log l where l.key = 'fin:' || s.id)
         order by s.ended_at
         limit 10
      loop
        perform private.discord_post('fin:' || r.id, 'fin', private.discord_stop_payload(r.id));
      end loop;
    exception when others then
      raise warning 'trinity discord sesiones: %', sqlerrm;
    end;
  end if;

  if st.discord_weekly and v_dow = 7 and extract(hour from v_local) >= 21 then
    begin
      perform private.discord_post('resumen:' || v_monday, 'resumen', private.discord_weekly_payload(v_monday));
    exception when others then
      raise warning 'trinity discord resumen: %', sqlerrm;
    end;
  end if;

  if st.discord_reminder and v_dow = 4 and extract(hour from v_local) >= 18 then
    begin
      perform private.discord_post('recordatorio:' || v_monday, 'recordatorio', private.discord_reminder_payload(v_monday));
    exception when others then
      raise warning 'trinity discord recordatorio: %', sqlerrm;
    end;
  end if;
end;
$$;


-- ─── RPC para la web ────────────────────────────────────────────────────────

-- Estado (sin la URL, que nunca sale de la base de datos).
create or replace function public.discord_status()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hook private.discord_webhook;
  v_last jsonb;
begin
  if not public.is_member() then
    raise exception 'trinity_not_member';
  end if;

  select * into v_hook from private.discord_webhook where id;

  select jsonb_build_object(
           'kind', l.kind,
           'sent_at', l.sent_at,
           'status', r.status_code,
           'error', coalesce(r.error_msg, case when r.timed_out then 'Tiempo de espera agotado' end)
         )
    into v_last
    from private.discord_log l
    left join net._http_response r on r.id = l.request_id
   order by l.sent_at desc
   limit 1;

  return jsonb_build_object(
    'configured', v_hook.url is not null,
    'set_at', v_hook.set_at,
    'set_by', (select display_name from public.members where id = v_hook.set_by),
    'last', v_last
  );
end;
$$;

-- Poner o quitar el webhook (solo el admin principal). Vacío = quitarlo.
create or replace function public.set_discord_webhook(p_url text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text := nullif(btrim(p_url), '');
begin
  if not public.is_owner() then
    raise exception 'trinity_not_owner';
  end if;

  if v_url is null then
    delete from private.discord_webhook where id;
    return;
  end if;

  v_url := regexp_replace(v_url, '\?.*$', '');
  if v_url !~ '^https://((ptb|canary)\.)?discord(app)?\.com/api/webhooks/[0-9]{15,21}/[A-Za-z0-9_-]{30,100}$' then
    raise exception 'trinity_bad_webhook';
  end if;

  insert into private.discord_webhook (id, url, set_by, set_at)
  values (true, v_url, auth.uid(), now())
  on conflict (id) do update
    set url = excluded.url, set_by = excluded.set_by, set_at = excluded.set_at;
end;
$$;

-- Mandar ahora (admins): 'prueba', 'resumen' o 'recordatorio' de esta semana.
-- Sirve para probar sin esperar al domingo o al jueves.
create or replace function public.discord_send_now(p_kind text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_today   date := (now() at time zone 'Europe/Madrid')::date;
  v_monday  date := v_today - (extract(isodow from v_today)::int - 1);
  v_payload jsonb;
  v_me      text;
begin
  if not public.is_admin() then
    raise exception 'trinity_not_admin';
  end if;
  if p_kind is null or p_kind not in ('prueba', 'resumen', 'recordatorio') then
    raise exception 'trinity_bad_kind';
  end if;
  if not exists (select 1 from private.discord_webhook where id) then
    raise exception 'trinity_no_webhook';
  end if;
  if exists (select 1 from private.discord_log
              where key like 'manual:%' and sent_at > now() - interval '10 seconds') then
    raise exception 'trinity_too_fast';
  end if;

  select display_name into v_me from public.members where id = auth.uid();

  v_payload := case p_kind
    when 'prueba' then jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
      'color', 3003583,
      'title', '👋 trinity-panel está conectado',
      'url', 'https://trinity-panel.pages.dev',
      'description', E'Aquí llegarán:\n• Inicio y fin de cada sesión\n• El resumen de la semana, el domingo a las 21:00\n• El recordatorio del jueves (18:00) a quien vaya por debajo del 50 %',
      'footer', jsonb_build_object('text', 'Prueba enviada por ' || coalesce(v_me, 'un admin'))
    )))
    when 'resumen' then private.discord_weekly_payload(v_monday)
    when 'recordatorio' then private.discord_reminder_payload(v_monday)
    else null
  end;

  if v_payload is null then
    raise exception 'trinity_nothing_to_send';
  end if;

  perform private.discord_post('manual:' || p_kind || ':' || extract(epoch from clock_timestamp()), p_kind, v_payload);
end;
$$;


-- ─── Copias de seguridad ────────────────────────────────────────────────────

create table if not exists public.backups (
  id         bigint generated always as identity primary key,
  taken_at   timestamptz not null default now(),
  kind       text not null check (kind in ('semanal', 'manual')),
  taken_by   uuid references public.members (id) on delete set null,
  counts     jsonb not null,
  size_bytes int not null,
  data       jsonb not null
);

create index if not exists backups_taken_idx on public.backups (taken_at desc);

alter table public.backups enable row level security;
revoke all on public.backups from anon;
revoke insert, update, delete on public.backups from authenticated;
grant select on public.backups to authenticated;
drop policy if exists "admins leen copias" on public.backups;
create policy "admins leen copias" on public.backups
  for select to authenticated using (public.is_admin());

create or replace function private.take_backup(p_kind text, p_by uuid default null)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_tables text[] := array['app_settings', 'allowed_members', 'members', 'member_colors', 'specialties',
                           'projects', 'sessions', 'session_specialties', 'absences', 'minimum_changes',
                           'session_reviews', 'session_deletions'];
  t        text;
  v_rows   jsonb;
  v_data   jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_id     bigint;
begin
  foreach t in array v_tables loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into v_rows;
    v_data   := v_data   || jsonb_build_object(t, v_rows);
    v_counts := v_counts || jsonb_build_object(t, jsonb_array_length(v_rows));
  end loop;

  v_data := jsonb_build_object('app', 'trinity-panel', 'version', 1, 'taken_at', now(), 'tables', v_data);

  insert into public.backups (kind, taken_by, counts, size_bytes, data)
  values (p_kind, p_by, v_counts, octet_length(v_data::text), v_data)
  returning id into v_id;

  -- Se quedan las 12 últimas de cada tipo.
  delete from public.backups b
   where b.kind = p_kind
     and b.id not in (select id from public.backups where kind = p_kind order by taken_at desc, id desc limit 12);

  return v_id;
end;
$$;

-- Copia a mano (admins). Como mucho una por minuto.
create or replace function public.backup_now()
returns bigint
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'trinity_not_admin';
  end if;
  if exists (select 1 from public.backups
              where kind = 'manual' and taken_by is not null and taken_at > now() - interval '1 minute') then
    raise exception 'trinity_too_fast';
  end if;
  return private.take_backup('manual', auth.uid());
end;
$$;


-- ─── Permisos ───────────────────────────────────────────────────────────────

revoke all on all tables in schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.discord_status(),
  public.set_discord_webhook(text),
  public.discord_send_now(text),
  public.backup_now()
from public, anon;

grant execute on function
  public.discord_status(),
  public.set_discord_webhook(text),
  public.discord_send_now(text),
  public.backup_now()
to authenticated;


-- ─── Primera copia y tareas programadas (pg_cron, en UTC) ──────────────────

select private.take_backup('manual');

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('trinity-discord', 'trinity-copia-semanal');
  -- Discord: cada minuto (decide él si toca avisar de algo).
  perform cron.schedule('trinity-discord', '* * * * *', 'select private.discord_tick()');
  -- Copia: lunes 03:00 UTC (04:00 o 05:00 en Madrid).
  perform cron.schedule('trinity-copia-semanal', '0 3 * * 1', $job$select private.take_backup('semanal')$job$);
exception when others then
  raise notice 'pg_cron no disponible (%). Actívalo en Database → Extensions y vuelve a ejecutar este bloque.', sqlerrm;
end
$$;
