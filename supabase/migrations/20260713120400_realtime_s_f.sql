-- ============================================================================
-- S-F · Realtime de `cliente` y `categoria`.
--
-- El listado y la ficha de cliente, los chips de color y los selectores de
-- categoría (incluida el alta en línea desde Entrada) deben reflejar en vivo lo
-- que crea o edita otro usuario. Mismo patrón que S-D/S-E: publicación +
-- replica identity full, idempotente.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cliente'
  ) then
    alter publication supabase_realtime add table cliente;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categoria'
  ) then
    alter publication supabase_realtime add table categoria;
  end if;
end $$;

alter table cliente   replica identity full;
alter table categoria replica identity full;
