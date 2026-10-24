-- ============================================================================
-- trinity-panel · Fase 3 · Cronómetro + "¿Qué has hecho?"
-- ----------------------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor → pegar → Run
-- (después de las migraciones de la Fase 2 y de la paleta).
--
-- Cómo funciona:
--   · El tiempo vive en el servidor: start_session guarda now() como inicio y
--     stop_session guarda now() como fin. El navegador solo pinta el segundero.
--   · Parar no pide la frase: la sesión queda "sin describir" hasta que el
--     miembro rellena la ventana (describe_session). Así la hora de fin es la
--     del clic, aunque tarde en escribir o cierre la pestaña.
--   · Corte automático a los `auto_cut_minutes` (4 h): la sesión se cierra en
--     inicio + 4 h y queda `needs_review`. Lo hace pg_cron cada minuto y, por si
--     pg_cron no está, también stop_session y la propia web.
--   · Menos de 1 minuto al parar = clic sin querer: se borra.
--   · Horas manuales: marcadas `is_manual` y `needs_review`, máx. 12 h, solo de
--     los últimos 7 días y nunca en el futuro.
--   · Nadie puede tener dos sesiones que se solapen (restricción en la tabla).
-- ============================================================================


-- ─── Tabla de sesiones ──────────────────────────────────────────────────────

create extension if not exists btree_gist with schema extensions;

-- Una sesión recién parada aún no tiene frase: se pide después.
alter table public.sessions drop constraint if exists sessions_closed_have_title;

-- Sin solapes por persona (una sesión en marcha llega hasta el infinito).
alter table public.sessions
  add constraint sessions_no_overlap
  exclude using gist (member_id with =, tstzrange(started_at, ended_at, '[)') with &&);


-- ─── Hora del servidor (para que el segundero no dependa del reloj del PC) ──

create or replace function public.server_now()
returns timestamptz
language sql stable set search_path = ''
as $$
  select now();
$$;


-- ─── Corte automático ───────────────────────────────────────────────────────

create or replace function public.cut_overdue_sessions()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.sessions s
     set ended_at     = s.started_at + make_interval(mins => st.auto_cut_minutes),
         needs_review = true
    from public.app_settings st
   where s.ended_at is null
     and now() >= s.started_at + make_interval(mins => st.auto_cut_minutes);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ─── Iniciar ────────────────────────────────────────────────────────────────

create or replace function public.start_session(p_project_id uuid default null)
returns public.sessions
language plpgsql security definer set search_path = ''
as $$
declare
  v_project uuid := p_project_id;
  v_row     public.sessions;
begin
  if not public.is_member() then
    raise exception 'trinity_not_member';
  end if;

  perform public.cut_overdue_sessions();

  -- Proyecto archivado o desconocido → el primero activo.
  if v_project is null
     or not exists (select 1 from public.projects where id = v_project and not is_archived) then
    select id into v_project from public.projects where not is_archived order by created_at limit 1;
  end if;
  if v_project is null then
    raise exception 'trinity_no_project';
  end if;

  begin
    insert into public.sessions (member_id, project_id, started_at, created_by)
    values (auth.uid(), v_project, now(), auth.uid())
    returning * into v_row;
  exception
    when unique_violation or exclusion_violation then
      raise exception 'trinity_already_running';
  end;

  return v_row;
end;
$$;


-- ─── Parar ──────────────────────────────────────────────────────────────────
-- Devuelve la sesión cerrada, o null si duraba menos de 1 minuto (se borra).

create or replace function public.stop_session()
returns public.sessions
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.sessions;
  v_cut interval;
begin
  select make_interval(mins => auto_cut_minutes) into v_cut from public.app_settings;

  select * into v_row
    from public.sessions
   where member_id = auth.uid() and ended_at is null
   for update;

  if not found then
    raise exception 'trinity_not_running';
  end if;

  if now() - v_row.started_at < interval '1 minute' then
    delete from public.sessions where id = v_row.id;
    return null;
  end if;

  update public.sessions
     set ended_at     = least(now(), started_at + v_cut),
         needs_review = needs_review or now() > started_at + v_cut
   where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;


-- ─── Describir ("¿Qué has hecho?") ─────────────────────────────────────────
-- El autor (o un admin) pone frase, especialidades, descripción y proyecto.
-- Nunca toca las horas.

create or replace function public.describe_session(
  p_session_id  uuid,
  p_title       text,
  p_specialties text[],
  p_description text default null,
  p_project_id  uuid default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_row   public.sessions;
  v_title text := nullif(btrim(p_title), '');
  v_desc  text := nullif(btrim(p_description), '');
  v_specs text[];
begin
  select * into v_row from public.sessions where id = p_session_id for update;

  if not found or (v_row.member_id <> auth.uid() and not public.is_admin()) then
    raise exception 'trinity_not_yours';
  end if;
  if v_row.ended_at is null then
    raise exception 'trinity_still_running';
  end if;
  if v_title is null or char_length(v_title) > 140 then
    raise exception 'trinity_bad_title';
  end if;
  if v_desc is not null and char_length(v_desc) > 2000 then
    raise exception 'trinity_bad_description';
  end if;

  select array_agg(distinct x) into v_specs from unnest(coalesce(p_specialties, '{}')) as x;
  if v_specs is null
     or exists (select 1 from unnest(v_specs) as x
                 where not exists (select 1 from public.specialties sp where sp.slug = x)) then
    raise exception 'trinity_bad_specialties';
  end if;

  if p_project_id is not null
     and not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'trinity_bad_project';
  end if;

  update public.sessions
     set title       = v_title,
         description = v_desc,
         project_id  = coalesce(p_project_id, project_id)
   where id = p_session_id;

  delete from public.session_specialties where session_id = p_session_id;
  insert into public.session_specialties (session_id, specialty_slug)
  select p_session_id, x from unnest(v_specs) as x;
end;
$$;


-- ─── Descartar ──────────────────────────────────────────────────────────────
-- Solo tu propia sesión de cronómetro recién parada (aún sin describir).

create or replace function public.discard_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.sessions
   where id = p_session_id
     and member_id = auth.uid()
     and ended_at is not null
     and title is null
     and not is_manual;

  if not found then
    raise exception 'trinity_cannot_discard';
  end if;
end;
$$;


-- ─── Horas a mano ("olvidé darle al play") ─────────────────────────────────

create or replace function public.add_manual_session(
  p_started_at  timestamptz,
  p_ended_at    timestamptz,
  p_title       text,
  p_specialties text[],
  p_description text default null,
  p_project_id  uuid default null
)
returns public.sessions
language plpgsql security definer set search_path = ''
as $$
declare
  v_row     public.sessions;
  v_project uuid := p_project_id;
begin
  if not public.is_member() then
    raise exception 'trinity_not_member';
  end if;

  if p_started_at is null or p_ended_at is null
     or p_ended_at > now() + interval '1 minute'
     or p_ended_at - p_started_at < interval '1 minute'
     or p_ended_at - p_started_at > interval '12 hours' then
    raise exception 'trinity_bad_range';
  end if;

  if p_started_at < now() - interval '7 days' then
    raise exception 'trinity_too_old';
  end if;

  if v_project is null
     or not exists (select 1 from public.projects where id = v_project and not is_archived) then
    select id into v_project from public.projects where not is_archived order by created_at limit 1;
  end if;

  begin
    insert into public.sessions (member_id, project_id, started_at, ended_at, is_manual, needs_review, created_by)
    values (auth.uid(), v_project, p_started_at, least(p_ended_at, now()), true, true, auth.uid())
    returning * into v_row;
  exception
    when exclusion_violation then
      raise exception 'trinity_overlap';
  end;

  -- Si la frase o las especialidades no valen, se deshace también el insert.
  perform public.describe_session(v_row.id, p_title, p_specialties, p_description, null);

  select * into v_row from public.sessions where id = v_row.id;
  return v_row;
end;
$$;


-- ─── Permisos de las funciones ──────────────────────────────────────────────

revoke execute on function
  public.server_now(),
  public.cut_overdue_sessions(),
  public.start_session(uuid),
  public.stop_session(),
  public.describe_session(uuid, text, text[], text, uuid),
  public.discard_session(uuid),
  public.add_manual_session(timestamptz, timestamptz, text, text[], text, uuid)
from public, anon;

grant execute on function
  public.server_now(),
  public.cut_overdue_sessions(),
  public.start_session(uuid),
  public.stop_session(),
  public.describe_session(uuid, text, text[], text, uuid),
  public.discard_session(uuid),
  public.add_manual_session(timestamptz, timestamptz, text, text[], text, uuid)
to authenticated;


-- ─── Corte automático cada minuto (pg_cron) ────────────────────────────────
-- Si pg_cron no se puede activar, no pasa nada: la web y stop_session cortan
-- igualmente. Puedes activarlo a mano en Database → Extensions → pg_cron.

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'trinity-corte-automatico';
  perform cron.schedule('trinity-corte-automatico', '* * * * *', 'select public.cut_overdue_sessions()');
exception when others then
  raise notice 'pg_cron no disponible (%). El corte lo harán la web y stop_session.', sqlerrm;
end
$$;
