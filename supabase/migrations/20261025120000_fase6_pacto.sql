-- ============================================================================
-- trinity-panel · Fase 6 · Reglas del pacto
-- ----------------------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor (después de la Fase 5).
--
-- Reglas (PACTO DE FAMILIA, secciones 1 y 3):
--   · Mínimo semanal (lunes–domingo). Cambiarlo NO reescribe semanas pasadas:
--     cada cambio vale desde un lunes concreto (`minimum_changes`).
--   · Ausencia justificada (exámenes, lesión o enfermedad, viaje, partido o
--     concentración): cada día ausente baja el mínimo de esa semana 1/7.
--     Semana entera ausente = justificada. Hay que avisar 48 h antes; una
--     lesión o enfermedad, en cuanto se pueda (hasta 7 días después).
--     Los admins pueden marcar ausencias de los demás sin esos límites.
--   · Recuperar: lo que falte una semana se compensa SOLO con lo que sobre la
--     semana siguiente (primero se cubre el mínimo propio de esa semana).
--   · Semana no cumplida, ni recuperada, ni justificada: la 1.ª vez es un
--     toque de atención; las siguientes, penalización.
--   · Las semanas cuentan desde el inicio del pacto y, para cada miembro,
--     desde la semana en que entró en la web. Los días de esa semana antes
--     de entrar cuentan como justificados (el mínimo baja en proporción).
--   · Validar sesiones (manuales o con corte automático): un admin, nunca el
--     dueño de la sesión. Corregir horas deja constancia con motivo.
-- ============================================================================


-- ─── Inicio del pacto ───────────────────────────────────────────────────────

alter table public.app_settings
  add column if not exists pact_starts_on date not null default date '2026-10-26';

alter table public.app_settings
  drop constraint if exists app_settings_pact_monday;
alter table public.app_settings
  add constraint app_settings_pact_monday check (extract(isodow from pact_starts_on) = 1);


-- ─── Historial del mínimo ───────────────────────────────────────────────────

create table if not exists public.minimum_changes (
  starts_on  date primary key check (extract(isodow from starts_on) = 1),
  minutes    int  not null check (minutes between 0 and 6000),
  note       text check (note is null or char_length(note) <= 280),
  changed_by uuid references public.members (id),
  changed_at timestamptz not null default now()
);

-- Punto de partida: el mínimo actual vale desde siempre.
insert into public.minimum_changes (starts_on, minutes, note)
select date '2026-01-05', weekly_min_minutes, 'Mínimo inicial del pacto'
  from public.app_settings
on conflict (starts_on) do nothing;

alter table public.minimum_changes enable row level security;
revoke all on public.minimum_changes from anon;
revoke insert, update, delete on public.minimum_changes from authenticated;
drop policy if exists "miembros leen el mínimo" on public.minimum_changes;
create policy "miembros leen el mínimo" on public.minimum_changes
  for select to authenticated using (public.is_member());

-- El mínimo ya no se toca a mano: solo con set_weekly_minimum (deja historial).
revoke update (weekly_min_minutes) on public.app_settings from authenticated;


-- ─── Revisiones de sesiones (validar / corregir) ───────────────────────────

create table if not exists public.session_reviews (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  action         text not null check (action in ('validada', 'corregida')),
  old_started_at timestamptz not null,
  old_ended_at   timestamptz not null,
  new_started_at timestamptz not null,
  new_ended_at   timestamptz not null,
  note           text check (note is null or char_length(note) <= 280),
  reviewed_by    uuid not null references public.members (id),
  reviewed_at    timestamptz not null default now()
);

create index if not exists session_reviews_session_idx on public.session_reviews (session_id);

alter table public.session_reviews enable row level security;
revoke all on public.session_reviews from anon;
revoke insert, update, delete on public.session_reviews from authenticated;
drop policy if exists "miembros leen revisiones" on public.session_reviews;
create policy "miembros leen revisiones" on public.session_reviews
  for select to authenticated using (public.is_member());


-- ─── Ausencias: solo por funciones (aplican la regla de las 48 h) ──────────

revoke insert, delete on public.absences from authenticated;
drop policy if exists "crear ausencias" on public.absences;
drop policy if exists "borrar ausencias" on public.absences;


-- ─── Mínimo de una semana ──────────────────────────────────────────────────

create or replace function public.minimum_for(p_week date)
returns int
language sql stable set search_path = ''
as $$
  select coalesce(
    (select mc.minutes from public.minimum_changes mc
      where mc.starts_on <= p_week order by mc.starts_on desc limit 1),
    (select weekly_min_minutes from public.app_settings)
  );
$$;


-- ─── Cambiar el mínimo (admins) ────────────────────────────────────────────
-- Vale desde un lunes de esta semana en adelante. Nunca hacia atrás.

create or replace function public.set_weekly_minimum(p_minutes int, p_starts_on date, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_today  date := (now() at time zone 'Europe/Madrid')::date;
  v_monday date := v_today - (extract(isodow from v_today)::int - 1);
  v_note   text := nullif(btrim(p_note), '');
begin
  if not public.is_admin() then
    raise exception 'trinity_not_admin';
  end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 6000 then
    raise exception 'trinity_bad_minimum';
  end if;
  if p_starts_on is null or extract(isodow from p_starts_on) <> 1 or p_starts_on < v_monday then
    raise exception 'trinity_bad_week';
  end if;
  if v_note is null or char_length(v_note) < 3 or char_length(v_note) > 280 then
    raise exception 'trinity_bad_reason';
  end if;

  insert into public.minimum_changes (starts_on, minutes, note, changed_by)
  values (p_starts_on, p_minutes, v_note, auth.uid())
  on conflict (starts_on) do update
    set minutes = excluded.minutes, note = excluded.note,
        changed_by = excluded.changed_by, changed_at = now();

  if p_starts_on = v_monday then
    update public.app_settings set weekly_min_minutes = p_minutes, updated_by = auth.uid() where id;
  end if;
end;
$$;


-- ─── Cambiar el inicio del pacto (admins) ──────────────────────────────────

create or replace function public.set_pact_start(p_starts_on date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'trinity_not_admin';
  end if;
  if p_starts_on is null or extract(isodow from p_starts_on) <> 1 then
    raise exception 'trinity_bad_week';
  end if;
  update public.app_settings set pact_starts_on = p_starts_on, updated_by = auth.uid() where id;
end;
$$;


-- ─── Avisar una ausencia ────────────────────────────────────────────────────

create or replace function public.add_absence(
  p_starts_on date,
  p_ends_on   date,
  p_reason    text,
  p_note      text default null,
  p_member_id uuid default null
)
returns public.absences
language plpgsql security definer set search_path = ''
as $$
declare
  v_member uuid := coalesce(p_member_id, auth.uid());
  v_today  date := (now() at time zone 'Europe/Madrid')::date;
  v_note   text := nullif(btrim(p_note), '');
  v_other  boolean;
  v_row    public.absences;
begin
  if not public.is_member() then
    raise exception 'trinity_not_member';
  end if;
  v_other := v_member <> auth.uid();
  if v_other and not public.is_admin() then
    raise exception 'trinity_not_admin';
  end if;
  if not exists (select 1 from public.members where id = v_member) then
    raise exception 'trinity_not_found';
  end if;

  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_ends_on - p_starts_on > 60 then
    raise exception 'trinity_bad_absence_range';
  end if;
  if p_reason is null or p_reason not in ('examenes', 'lesion', 'viaje', 'partido', 'otro') then
    raise exception 'trinity_bad_absence_reason';
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'trinity_bad_description';
  end if;

  -- Las reglas del pacto valen para uno mismo, también si eres admin.
  if not v_other then
    if p_reason = 'otro' then
      raise exception 'trinity_absence_other';
    end if;
    if p_reason = 'lesion' then
      if p_starts_on < v_today - 7 then
        raise exception 'trinity_absence_too_old';
      end if;
    elsif (p_starts_on::timestamp at time zone 'Europe/Madrid') - now() < interval '48 hours' then
      raise exception 'trinity_absence_late';
    end if;
  elsif p_reason = 'otro' and v_note is null then
    raise exception 'trinity_absence_note';
  end if;

  if exists (select 1 from public.absences a
              where a.member_id = v_member
                and a.starts_on <= p_ends_on and a.ends_on >= p_starts_on) then
    raise exception 'trinity_absence_overlap';
  end if;

  insert into public.absences (member_id, starts_on, ends_on, reason, note, created_by)
  values (v_member, p_starts_on, p_ends_on, p_reason, v_note, auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;


-- ─── Quitar una ausencia (la tuya, o cualquiera si eres admin) ─────────────

create or replace function public.delete_absence(p_absence_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.absences
   where id = p_absence_id
     and (member_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'trinity_not_found';
  end if;
end;
$$;


-- ─── Validar o corregir una sesión (admins, nunca la propia) ───────────────
-- Sin horas nuevas = validar tal cual. Con horas nuevas = corregir (motivo
-- obligatorio). En los dos casos la sesión deja de estar "para revisar".

create or replace function public.review_session(
  p_session_id uuid,
  p_started_at timestamptz default null,
  p_ended_at   timestamptz default null,
  p_note       text default null
)
returns public.sessions
language plpgsql security definer set search_path = ''
as $$
declare
  v_row   public.sessions;
  v_note  text := nullif(btrim(p_note), '');
  v_old_a timestamptz;
  v_old_b timestamptz;
  v_start timestamptz;
  v_end   timestamptz;
  v_fix   boolean;
begin
  if not public.is_admin() then
    raise exception 'trinity_not_admin';
  end if;

  select * into v_row from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'trinity_not_found';
  end if;
  if v_row.member_id = auth.uid() then
    raise exception 'trinity_review_own';
  end if;
  if v_row.ended_at is null then
    raise exception 'trinity_still_running';
  end if;

  v_old_a := v_row.started_at;
  v_old_b := v_row.ended_at;
  v_start := coalesce(p_started_at, v_old_a);
  v_end   := coalesce(p_ended_at, v_old_b);
  v_fix   := v_start <> v_old_a or v_end <> v_old_b;

  if v_fix then
    if v_end - v_start < interval '1 minute'
       or v_end - v_start > interval '24 hours'
       or v_end > now() + interval '1 minute' then
      raise exception 'trinity_bad_range';
    end if;
    if v_note is null or char_length(v_note) < 3 then
      raise exception 'trinity_bad_reason';
    end if;
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'trinity_bad_reason';
  end if;

  begin
    update public.sessions
       set started_at   = v_start,
           ended_at     = v_end,
           needs_review = false,
           reviewed_by  = auth.uid(),
           reviewed_at  = now()
     where id = p_session_id
    returning * into v_row;
  exception
    when exclusion_violation then
      raise exception 'trinity_overlap';
  end;

  insert into public.session_reviews
    (session_id, action, old_started_at, old_ended_at, new_started_at, new_ended_at, note, reviewed_by)
  values
    (p_session_id, case when v_fix then 'corregida' else 'validada' end,
     v_old_a, v_old_b, v_start, v_end, v_note, auth.uid());

  return v_row;
end;
$$;


-- ─── Estado del pacto, semana a semana ─────────────────────────────────────
-- Una fila por miembro y semana, desde su primera semana hasta la actual.
--   minutes    minutos de la semana (las sesiones que cruzan el lunes se parten)
--   review     de esos, los que esperan validación (cuentan mientras tanto)
--   min_base   mínimo vigente esa semana
--   absent     días justificados (0–7)
--   target     mínimo de esa semana con las ausencias descontadas
--   carry      solo semana actual: lo que falta recuperar de la anterior
--   status     en_curso · cumplida · justificada · recuperando · recuperada
--              · toque · penalizacion
--   strike     n.º de incumplimiento (1 = toque, 2+ = penalización)

create or replace function public.pact_status()
returns table (
  member_id  uuid,
  week_start date,
  minutes    numeric,
  review     numeric,
  min_base   int,
  absent     int,
  target     int,
  carry      int,
  status     text,
  strike     int
)
language sql stable set search_path = ''
as $$
  with cur as (
    select st.pact_starts_on,
           t.today,
           t.today - (extract(isodow from t.today)::int - 1) as cur_week
      from public.app_settings st,
           lateral (select (now() at time zone 'Europe/Madrid')::date as today) t
  ),
  mem as (
    -- Desde la semana en que entró (o el inicio del pacto, si es posterior).
    select m.id,
           j.d as joined_on,
           greatest(c.pact_starts_on, j.d - (extract(isodow from j.d)::int - 1)) as first_week
      from public.members m
      cross join cur c
      cross join lateral (select (m.created_at at time zone 'Europe/Madrid')::date as d) j
  ),
  weeks as (
    select mm.id as member_id,
           mm.joined_on,
           w::date as week_start,
           (w::date)::timestamp     at time zone 'Europe/Madrid' as lo,
           (w::date + 7)::timestamp at time zone 'Europe/Madrid' as hi
      from mem mm
      cross join cur c
      cross join lateral generate_series(mm.first_week, c.cur_week, interval '7 days') as w
  ),
  mins as (
    select w.member_id, w.week_start,
           -- `filter` evita que una semana sin sesiones (s = null) cuente entera:
           -- least/greatest ignoran los null.
           coalesce(sum(extract(epoch from least(coalesce(s.ended_at, now()), w.hi)
                                          - greatest(s.started_at, w.lo)) / 60)
                      filter (where s.id is not null), 0) as minutes,
           coalesce(sum(extract(epoch from least(coalesce(s.ended_at, now()), w.hi)
                                          - greatest(s.started_at, w.lo)) / 60)
                      filter (where s.id is not null and s.needs_review), 0) as review
      from weeks w
      left join public.sessions s
        on s.member_id = w.member_id
       and s.started_at < w.hi
       and coalesce(s.ended_at, now()) > w.lo
     group by w.member_id, w.week_start
  ),
  absd as (
    select w.member_id, w.week_start, count(distinct d)::int as absent
      from weeks w
      join public.absences a
        on a.member_id = w.member_id
       and a.starts_on <= w.week_start + 6
       and a.ends_on   >= w.week_start
      cross join lateral generate_series(greatest(a.starts_on, w.week_start),
                                         least(a.ends_on, w.week_start + 6),
                                         interval '1 day') as d
     group by w.member_id, w.week_start
  ),
  j as (
    select w.member_id, w.week_start,
           round(mi.minutes::numeric, 1) as minutes,
           round(mi.review::numeric, 1)  as review,
           public.minimum_for(w.week_start) as min_base,
           -- Días ausentes + días de esa semana antes de entrar en la web.
           least(7, coalesce(a.absent, 0)
                    + greatest(0, least(7, w.joined_on - w.week_start)))::int as absent,
           (w.week_start = c.cur_week) as is_current
      from weeks w
      join mins mi using (member_id, week_start)
      left join absd a using (member_id, week_start)
      cross join cur c
  ),
  k as (
    select j.*,
           round(j.min_base * (7 - j.absent) / 7.0)::int as target
      from j
  ),
  l as (
    select k.*,
           greatest(0, k.target - round(k.minutes))::int as deficit,
           greatest(0, round(k.minutes) - k.target)::int as surplus
      from k
  ),
  m as (
    select l.*,
           lead(l.surplus)    over w as next_surplus,
           lead(l.is_current) over w as next_current
      from l
    window w as (partition by l.member_id order by l.week_start)
  ),
  s as (
    select m.*,
           case
             when m.absent = 7 then 'justificada'
             when m.is_current then 'en_curso'
             when m.deficit = 0 then 'cumplida'
             when m.next_surplus >= m.deficit then 'recuperada'
             when m.next_current then 'recuperando'
             else 'incumplida'
           end as st
      from m
  ),
  t as (
    select s.*,
           case when s.st = 'incumplida' then
             count(*) filter (where s.st = 'incumplida')
               over (partition by s.member_id order by s.week_start
                     rows between unbounded preceding and current row)
           end::int as strike,
           lag(s.st)      over (partition by s.member_id order by s.week_start) as prev_st,
           lag(s.deficit) over (partition by s.member_id order by s.week_start) as prev_deficit
      from s
  )
  select t.member_id, t.week_start, t.minutes, t.review, t.min_base, t.absent, t.target,
         case when t.is_current and t.prev_st = 'recuperando' then t.prev_deficit else 0 end,
         case
           when t.st <> 'incumplida' then t.st
           when t.strike = 1 then 'toque'
           else 'penalizacion'
         end,
         t.strike
    from t
   order by t.member_id, t.week_start;
$$;


-- ─── Registro global: ahora con quién validó cada sesión ───────────────────

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
           s.description, s.is_manual, s.needs_review, s.reviewed_by, s.reviewed_at,
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
                 f.description, f.is_manual, f.needs_review, f.reviewed_by, f.reviewed_at,
                 coalesce((
                   select jsonb_agg(x.specialty_slug order by sp.sort)
                     from public.session_specialties x
                     join public.specialties sp on sp.slug = x.specialty_slug
                    where x.session_id = f.id
                 ), '[]'::jsonb) as specialties,
                 (select rv.action from public.session_reviews rv
                   where rv.session_id = f.id order by rv.reviewed_at desc limit 1) as review_action
            from f
           order by f.started_at desc, f.id
           limit least(greatest(coalesce(p_limit, 50), 1), 500)
          offset greatest(coalesce(p_offset, 0), 0)
        ) r
    ), '[]'::jsonb)
  );
$$;


-- ─── Permisos ───────────────────────────────────────────────────────────────

revoke execute on function
  public.minimum_for(date),
  public.set_weekly_minimum(int, date, text),
  public.set_pact_start(date),
  public.add_absence(date, date, text, text, uuid),
  public.delete_absence(uuid),
  public.review_session(uuid, timestamptz, timestamptz, text),
  public.pact_status()
from public, anon;

grant execute on function
  public.minimum_for(date),
  public.set_weekly_minimum(int, date, text),
  public.set_pact_start(date),
  public.add_absence(date, date, text, text, uuid),
  public.delete_absence(uuid),
  public.review_session(uuid, timestamptz, timestamptz, text),
  public.pact_status()
to authenticated;


-- ─── Tiempo real ────────────────────────────────────────────────────────────
-- Ausencias, cambios de mínimo y revisiones se ven al instante en los tres.

do $$
declare
  t text;
begin
  foreach t in array array['absences', 'minimum_changes', 'session_reviews', 'app_settings'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
