-- ============================================================================
-- Lista cerrada de TRINITY
-- ----------------------------------------------------------------------------
-- 1. Copia este archivo a `allowlist.sql` (está en .gitignore: no se sube).
-- 2. Cambia los números por el ID de Discord de cada uno:
--    Discord → Ajustes → Avanzado → activa "Modo desarrollador"
--    → clic derecho en tu nombre → "Copiar ID de usuario".
-- 3. Pégalo en Supabase → SQL Editor → Run.
--
-- Hazlo ANTES de que nadie intente entrar: si una cuenta no está aquí,
-- Supabase rechaza el login.
-- ============================================================================

insert into public.allowed_members (discord_id, display_name, is_admin, is_owner) values
  ('000000000000000001', 'Ake',    true, true),   -- admin principal
  ('000000000000000002', 'Miembro 2', true, false),
  ('000000000000000003', 'Miembro 3', true, false)
on conflict (discord_id) do update
  set display_name = excluded.display_name,
      is_admin     = excluded.is_admin,
      is_owner     = excluded.is_owner;
