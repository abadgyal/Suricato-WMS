-- ============================================================================
-- S-D · Activación reproducible de Realtime (saldo de deuda [S-C]).
-- Fuente: prompt S-D (bloque 1), docs/SPEC.md §14.
--
-- Deja la activación de Realtime en una migración (antes era un comando suelto
-- ejecutado a mano sobre `producto`). Escuchamos en vivo:
--   * producto   — inventario en tiempo real (S-C).
--   * movimiento  — dashboard / historial en tiempo real (S-D).
--
-- `replica identity full` hace que los eventos UPDATE/DELETE incluyan la fila
-- completa (necesario para filtrar/aplicar cambios en el cliente). Todo es
-- idempotente: `producto` ya podía estar en la publicación.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'producto'
  ) then
    alter publication supabase_realtime add table producto;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'movimiento'
  ) then
    alter publication supabase_realtime add table movimiento;
  end if;
end $$;

alter table producto   replica identity full;
alter table movimiento replica identity full;
