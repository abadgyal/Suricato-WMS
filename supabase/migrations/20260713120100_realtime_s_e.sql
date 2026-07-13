-- ============================================================================
-- S-E · Realtime de `evento` y `reserva`.
-- Fuente: prompt S-E (bloque 6), docs/SPEC.md §14.
--
-- La ficha de evento, el calendario y el inventario tienen que reaccionar en
-- vivo a lo que hace otro cliente: crear/cancelar una reserva cambia
-- `disponible_real` (vista v_producto_disponible) sin tocar la tabla `producto`,
-- así que escuchar solo `producto` (S-C/S-D) no basta.
--
-- Mismo patrón que 20260709120400_realtime_s_d.sql: publicación + replica
-- identity full, todo idempotente.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'evento'
  ) then
    alter publication supabase_realtime add table evento;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reserva'
  ) then
    alter publication supabase_realtime add table reserva;
  end if;
end $$;

alter table evento  replica identity full;
alter table reserva replica identity full;
