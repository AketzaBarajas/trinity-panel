-- ============================================================================
-- trinity-panel · Fase 5 · Registro global con filtros
-- ----------------------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor.
--
--   · `session_log` filtra en el servidor por persona, fechas, especialidad,
--     proyecto y texto, y devuelve a la vez los totales de TODO el filtro
--     (no solo de la página cargada): minutos, sesiones, reparto por persona
--     y por día.
--   · Fechas en días de Madrid. Una sesión pertenece al día en que EMPIEZA
--     (es el día que se ve en la lista). Su duración cuenta entera.
--   · El texto busca en la frase y la descripción, sin distinguir mayúsculas
--     ni tildes ("guia" encuentra "Guía").
--   · Varias personas / especialidades / proyectos = cualquiera de ellos.
--   · Respeta RLS (security invoker): solo miembros.
-- ============================================================================

create extension if not exists unaccent with schema extensions;

create or replace function public.session_log(
  p_members     uuid[] default null,
  p_from        date   default null,
  p_to          date   default null,
  p_specialties text[] default null,
  p_projects    uuid[] default null,
  p_q           text   default null,
  p_limit       int    default 50,
  p_offset      int    default 0
)
returns jsonb
language sql stable set search_path = ''
as $$
  with pat as (
    select case
             when nullif(btrim(coalesce(p_q, '')), '') is null then null
             else '%' || replace(replace(replace(
                    extensions.unaccent('extensions.unaccent', lower(btrim(p_q))),
                    '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as q
  ),
  f as (
    select s.id, s.member_id, s.project_id, s.started_at, s.ended_at, s.title,
           s.description, s.is_manual, s.needs_review,
           extract(epoch from coalesce(s.ended_at, now()) - s.started_at) / 60 as mins,
           (s.started_at at time zone 'Europe/Madrid')::date as day
      from public.sessions s, pat
     where (coalesce(cardinality(p_members), 0) = 0 or s.member_id = any (p_members))
       and (coalesce(cardinality(p_projects), 0) = 0 or s.project_id = any (p_projects))
       and (p_from is null or s.started_at >= p_from::timestamp at time zone 'Europe/Madrid')
       and (p_to   is null or s.started_at <  (p_to + 1)::timestamp at time zone 'Europe/Madrid')
       and (coalesce(cardinality(p_specialties), 0) = 0 or exists (
             select 1 from public.session_specialties x
              where x.session_id = s.id and x.specialty_slug = any (p_specialties)))
       and (pat.q is null or extensions.unaccent('extensions.unaccent',
             lower(coalesce(s.title, '') || ' ' || coalesce(s.description, ''))) like pat.q)
  )
  select jsonb_build_object(
    'total_count',   (select count(*) from f),
    'total_minutes', (select coalesce(round(sum(mins)::numeric, 1), 0) from f),
    'by_member', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', t.member_id, 'minutes', round(t.m::numeric, 1), 'count', t.c))
        from (select member_id, sum(mins) as m, count(*) as c from f group by member_id) t
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', t.day, 'minutes', round(t.m::numeric, 1), 'count', t.c))
        from (select day, sum(mins) as m, count(*) as c from f group by day) t
    ), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.started_at desc, r.id)
        from (
          select f.id, f.member_id, f.project_id, f.started_at, f.ended_at, f.title,
                 f.description, f.is_manual, f.needs_review,
                 coalesce((
                   select jsonb_agg(x.specialty_slug order by sp.sort)
                     from public.session_specialties x
                     join public.specialties sp on sp.slug = x.specialty_slug
                    where x.session_id = f.id
                 ), '[]'::jsonb) as specialties
            from f
           order by f.started_at desc, f.id
           limit least(greatest(coalesce(p_limit, 50), 1), 500)
          offset greatest(coalesce(p_offset, 0), 0)
        ) r
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.session_log(uuid[], date, date, text[], uuid[], text, int, int) from public, anon;
grant  execute on function public.session_log(uuid[], date, date, text[], uuid[], text, int, int) to authenticated;
