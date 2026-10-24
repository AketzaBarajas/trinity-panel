-- ============================================================================
-- trinity-panel · Paleta de miembros validada (daltonismo y fondo negro)
-- ----------------------------------------------------------------------------
-- Los colores anteriores (azul/morado/índigo) eran casi indistinguibles para
-- protanopía. Esta paleta pasa las 5 comprobaciones del validador en oscuro y
-- en claro. Los miembros que ya tenían color pasan a su equivalente.
-- Ejecutar una vez en Supabase → SQL Editor.
-- ============================================================================

insert into public.member_colors (hex, name, sort) values
  ('#1FA374', 'Verde',    1),
  ('#3A70F0', 'Azul',     2),
  ('#CB62C2', 'Orquídea', 3),
  ('#B0900C', 'Oro',      4)
on conflict (hex) do update set name = excluded.name, sort = excluded.sort;

-- Equivalencias de los colores antiguos.
update public.members set color = case color
    when '#34D399' then '#1FA374'
    when '#60A5FA' then '#3A70F0'
    when '#C084FC' then '#CB62C2'
    when '#818CF8' then '#3A70F0'
    when '#A3E635' then '#B0900C'
    else color
  end
where color in ('#34D399', '#60A5FA', '#C084FC', '#818CF8', '#A3E635');

delete from public.member_colors
where hex in ('#34D399', '#60A5FA', '#C084FC', '#818CF8', '#A3E635');
