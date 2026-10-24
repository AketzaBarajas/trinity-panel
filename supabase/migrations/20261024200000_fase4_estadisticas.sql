-- ============================================================================
-- trinity-panel · Fase 4 · Estadísticas para el dashboard
-- ----------------------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor.
--
--   · Las gráficas no descargan todas las sesiones: piden totales ya sumados.
--   · Todo se reparte por días y horas de Madrid (cambio de hora incluido).
--     Una sesión que cruza la medianoche cuenta en los dos días.
--   · Una sesión en marcha cuenta hasta ahora mismo.
--   · Las funciones respetan RLS (security invoker): solo miembros.
-- ============================================================================


-- ─── Paleta de especialidades validada ─────────────────────────────────────
-- La anterior fallaba el validador (turquesa≈gris para daltónicos, rojo≈rosa
-- incluso con vista normal). Mismas familias, pasos nuevos. El orden (`sort`)
-- es el que separa bien a las vecinas en el donut y en el abanico del orbe.
-- Pasa en oscuro (#030405) y en claro (#F5F6F5): CVD 12,3 · normal 22,3.

update public.specialties as s set color = v.color, sort = v.sort
from (values
  ('mantenimiento', '#4A7AB1', 1),
  ('video',         '#A03B22', 2),
  ('formacion',     '#959609', 3),
  ('contenido',     '#AF1A7C', 4),
  ('web',           '#C47212', 5),
  ('pruebas',       '#07908E', 6),
  ('reuniones',     '#D76034', 7)
) as v(slug, color, sort)
where s.slug = v.slug;


-- ─── Minutos por día y persona ──────────────────────────────────────────────

create or replace function public.daily_minutes(p_from date, p_to date)
returns table (day date, member_id uuid, minutes numeric)
language sql stable set search_path = ''
as $$
  with days as (
    select d::date as day,
           (d::date)::timestamp     at time zone 'Europe/Madrid' as lo,
           (d::date + 1)::timestamp at time zone 'Europe/Madrid' as hi
      from generate_series(p_from, least(p_to, p_from + 1500), interval '1 day') as d
  )
  select days.day,
         s.member_id,
         round(sum(extract(epoch from least(coalesce(s.ended_at, now()), days.hi)
                                    - greatest(s.started_at, days.lo)) / 60)::numeric, 1)
    from days
    join public.sessions s
      on s.started_at < days.hi
     and coalesce(s.ended_at, now()) > days.lo
   group by days.day, s.member_id
   order by days.day, s.member_id;
$$;


-- ─── Minutos por franja (día de la semana × hora) y persona ────────────────

create or replace function public.hourly_minutes(p_from date, p_to date)
returns table (dow smallint, hour smallint, member_id uuid, minutes numeric)
language sql stable set search_path = ''
as $$
  with bounds as (
    select (p_from::timestamp at time zone 'Europe/Madrid') as lo,
           ((least(p_to, p_from + 1500) + 1)::timestamp at time zone 'Europe/Madrid') as hi
  ),
  -- Solo las horas en las que hay alguna sesión (no recorre años vacíos).
  cut as (
    select s.member_id,
           greatest(s.started_at, b.lo) as a,
           least(coalesce(s.ended_at, now()), b.hi) as z
      from public.sessions s, bounds b
     where s.started_at < b.hi and coalesce(s.ended_at, now()) > b.lo
  ),
  pieces as (
    select c.member_id,
           h as hour_start,
           greatest(c.a, h) as a,
           least(c.z, h + interval '1 hour') as z
      from cut c,
           generate_series(date_trunc('hour', c.a), c.z, interval '1 hour') as h
     where c.z > c.a
  )
  select extract(isodow from p.hour_start at time zone 'Europe/Madrid')::smallint,
         extract(hour   from p.hour_start at time zone 'Europe/Madrid')::smallint,
         p.member_id,
         round(sum(extract(epoch from p.z - p.a) / 60)::numeric, 1)
    from pieces p
   where p.z > p.a
   group by 1, 2, 3;
$$;


-- ─── Minutos por especialidad y persona ────────────────────────────────────
-- Una sesión con varias especialidades reparte su tiempo a partes iguales.

create or replace function public.specialty_minutes(p_from date, p_to date)
returns table (specialty_slug text, member_id uuid, minutes numeric)
language sql stable set search_path = ''
as $$
  with bounds as (
    select (p_from::timestamp at time zone 'Europe/Madrid') as lo,
           ((least(p_to, p_from + 1500) + 1)::timestamp at time zone 'Europe/Madrid') as hi
  ),
  cut as (
    select s.id, s.member_id,
           extract(epoch from least(coalesce(s.ended_at, now()), b.hi) - greatest(s.started_at, b.lo)) / 60 as mins,
           (select count(*) from public.session_specialties x where x.session_id = s.id) as n
      from public.sessions s, bounds b
     where s.started_at < b.hi and coalesce(s.ended_at, now()) > b.lo
  )
  select ss.specialty_slug, c.member_id, round(sum(c.mins / c.n)::numeric, 1)
    from cut c
    join public.session_specialties ss on ss.session_id = c.id
   where c.n > 0
   group by 1, 2;
$$;


revoke execute on function
  public.daily_minutes(date, date),
  public.hourly_minutes(date, date),
  public.specialty_minutes(date, date)
from public, anon;

grant execute on function
  public.daily_minutes(date, date),
  public.hourly_minutes(date, date),
  public.specialty_minutes(date, date)
to authenticated;
