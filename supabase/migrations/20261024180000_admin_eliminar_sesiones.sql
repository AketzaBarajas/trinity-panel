-- ============================================================================
-- trinity-panel · Admins eliminan sesiones (con motivo y registro visible)
-- ----------------------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor (después de la Fase 3).
--
--   · Solo un admin puede eliminar una sesión de cualquiera (también una en
--     marcha, p. ej. un cronómetro olvidado).
--   · Hay que dar un motivo. La sesión borrada queda copiada en
--     `session_deletions`, que todos pueden leer (transparencia del pacto).
--   · Nadie puede editar ni borrar ese registro desde la web.
-- ============================================================================

create table public.session_deletions (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null,
  member_id    uuid not null references public.members (id) on delete cascade,
  project_id   uuid references public.projects (id),
  started_at   timestamptz not null,
  ended_at     timestamptz,
  title        text,
  is_manual    boolean not null default false,
  specialties  text[] not null default '{}',
  reason       text not null check (char_length(reason) between 3 and 280),
  deleted_by   uuid not null references public.members (id),
  deleted_at   timestamptz not null default now()
);

create index session_deletions_deleted_at_idx on public.session_deletions (deleted_at desc);

alter table public.session_deletions enable row level security;

revoke all on public.session_deletions from anon;
revoke insert, update, delete on public.session_deletions from authenticated;

create policy "miembros leen eliminadas" on public.session_deletions
  for select to authenticated using (public.is_member());


create or replace function public.admin_delete_session(p_session_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_row    public.sessions;
  v_specs  text[];
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not public.is_admin() then
    raise exception 'trinity_not_admin';
  end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 280 then
    raise exception 'trinity_bad_reason';
  end if;

  select coalesce(array_agg(specialty_slug order by specialty_slug), '{}')
    into v_specs
    from public.session_specialties
   where session_id = p_session_id;

  delete from public.sessions where id = p_session_id returning * into v_row;
  if not found then
    raise exception 'trinity_not_found';
  end if;

  insert into public.session_deletions
    (session_id, member_id, project_id, started_at, ended_at, title, is_manual, specialties, reason, deleted_by)
  values
    (v_row.id, v_row.member_id, v_row.project_id, v_row.started_at, v_row.ended_at, v_row.title,
     v_row.is_manual, v_specs, v_reason, auth.uid());
end;
$$;

revoke execute on function public.admin_delete_session(uuid, text) from public, anon;
grant  execute on function public.admin_delete_session(uuid, text) to authenticated;

-- El registro de eliminadas se actualiza en vivo en la página Sesiones.
alter publication supabase_realtime add table public.session_deletions;
