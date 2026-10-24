-- ============================================================================
-- trinity-panel · Fase 2 · Base de datos + login
-- ----------------------------------------------------------------------------
-- Ejecutar UNA vez en el proyecto de Supabase (SQL Editor → pegar → Run),
-- o con `npx supabase db push` si el proyecto está enlazado.
--
-- Principios:
--   · Todo en UTC; la web lo muestra en Europe/Madrid.
--   · Solo entran las cuentas de Discord de `allowed_members` (lista cerrada).
--   · Todos los miembros leen todo (transparencia del pacto).
--   · Nadie escribe horas directamente: el cronómetro (Fase 3) lo hará con
--     funciones RPC que validan en el servidor. De momento las sesiones son
--     de solo lectura salvo la frase y la descripción.
-- ============================================================================


-- ─── Catálogos ──────────────────────────────────────────────────────────────

-- Colores que puede elegir un miembro. Únicos por miembro (ver members.color).
-- Ninguno choca con los colores de especialidad (ámbar, rosa, rojo, gris,
-- turquesa, naranja, amarillo).
create table public.member_colors (
  hex  text primary key check (hex ~ '^#[0-9A-F]{6}$'),
  name text not null,
  sort smallint not null
);

insert into public.member_colors (hex, name, sort) values
  ('#34D399', 'Verde',   1),
  ('#60A5FA', 'Azul',    2),
  ('#C084FC', 'Morado',  3),
  ('#818CF8', 'Índigo',  4),
  ('#A3E635', 'Lima',    5);

create table public.specialties (
  slug  text primary key,
  name  text not null,
  emoji text not null,
  color text not null check (color ~ '^#[0-9A-F]{6}$'),
  sort  smallint not null
);

insert into public.specialties (slug, name, emoji, color, sort) values
  ('web',           'Página web',              '💻', '#F59E0B', 1),
  ('contenido',     'Creación de contenido',   '✍️', '#EC4899', 2),
  ('video',         'Vídeo / redes',           '🎬', '#EF4444', 3),
  ('mantenimiento', 'Mantenimiento',           '🛠️', '#94A3B8', 4),
  ('pruebas',       'Pruebas en el juego',     '🎮', '#14B8A6', 5),
  ('reuniones',     'Reuniones / organización','🗣️', '#F97316', 6),
  ('formacion',     'Formación',               '📚', '#EAB308', 7);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 60),
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

insert into public.projects (name) values ('InfoCraft');


-- ─── Ajustes globales (una sola fila) ───────────────────────────────────────

create table public.app_settings (
  id                 boolean primary key default true check (id),
  weekly_min_minutes int  not null default 240 check (weekly_min_minutes between 0 and 6000),
  auto_cut_minutes   int  not null default 240 check (auto_cut_minutes between 30 and 720),
  timezone           text not null default 'Europe/Madrid',
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

insert into public.app_settings default values;


-- ─── Miembros ───────────────────────────────────────────────────────────────

-- Lista cerrada: solo estas cuentas de Discord pueden crear usuario.
-- La rellena Ake (ver supabase/allowlist.example.sql).
create table public.allowed_members (
  discord_id   text primary key check (discord_id ~ '^[0-9]{15,21}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  is_admin     boolean not null default true,
  is_owner     boolean not null default false,
  created_at   timestamptz not null default now()
);

create unique index allowed_members_single_owner
  on public.allowed_members (is_owner) where is_owner;

create table public.members (
  id                  uuid primary key references auth.users (id) on delete cascade,
  discord_id          text not null unique references public.allowed_members (discord_id),
  display_name        text not null check (char_length(display_name) between 1 and 40),
  avatar_url          text,
  role_label          text check (role_label is null or char_length(role_label) <= 32),
  color               text unique references public.member_colors (hex),
  weekly_goal_minutes int  check (weekly_goal_minutes is null or weekly_goal_minutes between 0 and 6000),
  is_admin            boolean not null default false,
  is_owner            boolean not null default false,
  onboarded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index members_single_owner on public.members (is_owner) where is_owner;


-- ─── Sesiones de trabajo ────────────────────────────────────────────────────

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id) on delete cascade,
  project_id   uuid not null references public.projects (id),
  started_at   timestamptz not null,
  ended_at     timestamptz,                       -- null = cronómetro en marcha
  title        text check (title is null or char_length(title) between 1 and 140),
  description  text check (description is null or char_length(description) <= 2000),
  is_manual    boolean not null default false,    -- añadida a mano
  needs_review boolean not null default false,    -- corte automático o manual sin validar
  reviewed_by  uuid references public.members (id),
  reviewed_at  timestamptz,
  created_by   uuid references public.members (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint sessions_end_after_start
    check (ended_at is null or ended_at > started_at),
  constraint sessions_max_24h
    check (ended_at is null or ended_at - started_at <= interval '24 hours'),
  constraint sessions_closed_have_title
    check (ended_at is null or title is not null or needs_review)
);

-- Un solo cronómetro en marcha por persona.
create unique index sessions_one_running_per_member
  on public.sessions (member_id) where ended_at is null;

create index sessions_started_at_idx on public.sessions (started_at desc);
create index sessions_member_started_idx on public.sessions (member_id, started_at desc);
create index sessions_project_idx on public.sessions (project_id);

-- Una sesión puede tener varias especialidades.
create table public.session_specialties (
  session_id     uuid not null references public.sessions (id) on delete cascade,
  specialty_slug text not null references public.specialties (slug),
  primary key (session_id, specialty_slug)
);

create index session_specialties_slug_idx on public.session_specialties (specialty_slug);


-- ─── Ausencias justificadas ─────────────────────────────────────────────────

create table public.absences (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members (id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  reason     text not null check (reason in ('examenes', 'lesion', 'viaje', 'partido', 'otro')),
  note       text check (note is null or char_length(note) <= 280),
  created_by uuid references public.members (id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint absences_valid_range check (ends_on >= starts_on)
);

create index absences_member_idx on public.absences (member_id, starts_on);


-- ─── Funciones auxiliares ───────────────────────────────────────────────────

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.members where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.members where id = auth.uid() and is_admin);
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.members where id = auth.uid() and is_owner);
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_touch  before update on public.members  for each row execute function public.touch_updated_at();
create trigger sessions_touch before update on public.sessions for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.app_settings for each row execute function public.touch_updated_at();


-- ─── Alta automática al entrar con Discord (y bloqueo de desconocidos) ──────

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_discord_id text := coalesce(new.raw_user_meta_data ->> 'provider_id',
                                new.raw_user_meta_data ->> 'sub');
  v_allowed    public.allowed_members;
begin
  select * into v_allowed
  from public.allowed_members
  where discord_id = v_discord_id;

  if not found then
    -- Aborta la creación del usuario: Supabase devuelve error al login.
    raise exception 'trinity_not_allowed: la cuenta % no está en la lista de TRINITY',
      coalesce(v_discord_id, '(sin id de Discord)');
  end if;

  insert into public.members (id, discord_id, display_name, avatar_url, is_admin, is_owner)
  values (
    new.id,
    v_discord_id,
    v_allowed.display_name,
    new.raw_user_meta_data ->> 'avatar_url',
    v_allowed.is_admin,
    v_allowed.is_owner
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene el avatar al día cuando Discord lo cambia.
create or replace function public.sync_member_avatar()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.members
     set avatar_url = new.raw_user_meta_data ->> 'avatar_url'
   where id = new.id
     and avatar_url is distinct from new.raw_user_meta_data ->> 'avatar_url';
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.sync_member_avatar();


-- ─── RPC: dar o quitar admin (solo el admin principal) ──────────────────────

create or replace function public.set_member_admin(p_member_id uuid, p_is_admin boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Solo el admin principal puede cambiar permisos de admin';
  end if;

  if exists (select 1 from public.members where id = p_member_id and is_owner) and not p_is_admin then
    raise exception 'El admin principal no puede quitarse el admin';
  end if;

  update public.members set is_admin = p_is_admin where id = p_member_id;
end;
$$;


-- ─── Permisos de columna (lo que el navegador puede tocar) ──────────────────

-- El rol `anon` (sin login) no ve nada.
revoke all on public.member_colors, public.specialties, public.projects,
              public.app_settings, public.allowed_members, public.members,
              public.sessions, public.session_specialties, public.absences
  from anon;

-- members: cada uno solo edita su rol, color, objetivo y fecha de bienvenida.
revoke insert, update, delete on public.members from authenticated;
grant update (role_label, color, weekly_goal_minutes, onboarded_at)
  on public.members to authenticated;

-- sessions: de momento solo frase y descripción. Fase 3 añade RPCs.
revoke insert, update, delete on public.sessions from authenticated;
grant update (title, description) on public.sessions to authenticated;

-- catálogos de solo lectura
revoke insert, update, delete on public.member_colors, public.specialties from authenticated;

-- ajustes: solo los campos editables
revoke insert, update, delete on public.app_settings from authenticated;
grant update (weekly_min_minutes, auto_cut_minutes, updated_by) on public.app_settings to authenticated;

-- ausencias: crear y borrar, no editar
revoke update on public.absences from authenticated;

revoke execute on function public.set_member_admin(uuid, boolean) from anon, public;
grant  execute on function public.set_member_admin(uuid, boolean) to authenticated;


-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table public.member_colors       enable row level security;
alter table public.specialties         enable row level security;
alter table public.projects            enable row level security;
alter table public.app_settings        enable row level security;
alter table public.allowed_members     enable row level security;
alter table public.members             enable row level security;
alter table public.sessions            enable row level security;
alter table public.session_specialties enable row level security;
alter table public.absences            enable row level security;

-- Lectura: cualquier miembro lo ve todo.
create policy "miembros leen colores"       on public.member_colors       for select to authenticated using (public.is_member());
create policy "miembros leen especialidades" on public.specialties        for select to authenticated using (public.is_member());
create policy "miembros leen proyectos"     on public.projects            for select to authenticated using (public.is_member());
create policy "miembros leen ajustes"       on public.app_settings        for select to authenticated using (public.is_member());
create policy "miembros leen miembros"      on public.members             for select to authenticated using (public.is_member());
create policy "miembros leen sesiones"      on public.sessions            for select to authenticated using (public.is_member());
create policy "miembros leen especialidades de sesion" on public.session_specialties for select to authenticated using (public.is_member());
create policy "miembros leen ausencias"     on public.absences            for select to authenticated using (public.is_member());

-- Lista cerrada: la ven los admins; solo el admin principal la cambia.
create policy "admins leen la lista"        on public.allowed_members for select to authenticated using (public.is_admin());
create policy "owner añade a la lista"      on public.allowed_members for insert to authenticated with check (public.is_owner());
create policy "owner borra de la lista"     on public.allowed_members for delete to authenticated using (public.is_owner() and not is_owner);

-- Perfil propio.
create policy "cada uno edita su perfil" on public.members
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Proyectos: los admins los crean y archivan.
create policy "admins crean proyectos"  on public.projects for insert to authenticated with check (public.is_admin());
create policy "admins editan proyectos" on public.projects for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Ajustes: los admins.
create policy "admins editan ajustes" on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Sesiones: el autor o un admin editan frase/descripción.
create policy "autor o admin editan texto" on public.sessions
  for update to authenticated
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

-- Especialidades de una sesión: el autor o un admin.
create policy "autor o admin ponen especialidades" on public.session_specialties
  for insert to authenticated
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_id and (s.member_id = auth.uid() or public.is_admin())
  ));

create policy "autor o admin quitan especialidades" on public.session_specialties
  for delete to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and (s.member_id = auth.uid() or public.is_admin())
  ));

-- Ausencias: cada uno las suyas; los admins las de cualquiera.
create policy "crear ausencias" on public.absences
  for insert to authenticated
  with check (member_id = auth.uid() or public.is_admin());

create policy "borrar ausencias" on public.absences
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());


-- ─── Tiempo real ────────────────────────────────────────────────────────────
-- members: el selector de color se actualiza al instante.
-- sessions: "Marco trabajando · 0:42" en vivo (Fase 3).

alter publication supabase_realtime add table public.members, public.sessions;
