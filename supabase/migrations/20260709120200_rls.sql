-- ============================================================================
-- S-B · RLS por rol + privilegios acotados. docs/CONTRACTS.md §1.3/§3.
--
-- Punto de partida (S-0): las tablas se crearon con auto-expose, así que anon y
-- authenticated tenían TODOS los privilegios (SELECT/INSERT/UPDATE/DELETE) y RLS
-- estaba desactivado. Aquí se cierra: se revoca todo y se concede lo justo, con
-- RLS activo y políticas por rol.
--
-- Modelo:
--   * Lecturas: cualquier usuario autenticado lee inventario, movimientos,
--     reservas, eventos, clientes y categorías. En `perfil`, cada uno lee su fila;
--     el admin lee todas.
--   * Buckets de producto y movimiento: NO se escriben directo. Solo las RPC
--     (SECURITY DEFINER) los tocan. authenticated no tiene INSERT en movimiento ni
--     UPDATE sobre las columnas de bucket de producto (privilegios por columna).
--   * CRUD directo: categoría = solo admin; cliente y evento = trabajador+;
--     metadatos de producto (no buckets) = trabajador+.
--   * anon (no autenticado): sin privilegios ⇒ no lee nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Cerrar el auto-expose de S-0.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Privilegios acotados a authenticated (anon queda sin nada).
--    RLS filtra por rol/fila; los privilegios acotan qué comando/columna.
-- ---------------------------------------------------------------------------
-- Lecturas.
grant select on perfil, categoria, cliente, producto, evento, reserva, movimiento
  to authenticated;
grant select on v_producto_disponible, v_stock_por_categoria,
                v_unidades_fuera_evento, v_conflictos_reserva
  to authenticated;

-- Categoría: CRUD directo (RLS lo restringe a admin).
grant insert, update, delete on categoria to authenticated;

-- Cliente: crear/editar (trabajador+).
grant insert, update on cliente to authenticated;

-- Evento: crear/editar (trabajador+). UPDATE por columnas: creado_por es inmutable
-- (no se concede), así se preserva la autoría.
grant insert on evento to authenticated;
grant update (nombre, cliente_id, fecha_inicio, fecha_fin, estado, notas)
  on evento to authenticated;

-- Producto: editar SOLO metadatos. Las columnas de bucket y baja_acumulada NO se
-- conceden ⇒ un UPDATE que las toque falla con "permission denied for column".
grant update (nombre, categoria_id, foto_path, stock_minimo, ubicacion,
              cliente_id, largo_cm, ancho_cm, alto_cm, peso_kg)
  on producto to authenticated;

-- movimiento, reserva y perfil: solo SELECT para authenticated. Sus escrituras van
-- por RPC (SECURITY DEFINER) o por la Edge Function con service_role.

-- ---------------------------------------------------------------------------
-- 3) Activar RLS en todas las tablas.
-- ---------------------------------------------------------------------------
alter table perfil     enable row level security;
alter table categoria  enable row level security;
alter table cliente    enable row level security;
alter table producto   enable row level security;
alter table evento     enable row level security;
alter table reserva    enable row level security;
alter table movimiento enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Políticas. (Todas permissive; `to authenticated`.)
--    is_admin()/auth.uid() son SECURITY DEFINER y leen perfil saltándose RLS,
--    así que no hay recursión en las políticas de perfil.
-- ---------------------------------------------------------------------------

-- perfil: cada uno su fila; el admin, todas. Sin escritura directa (Edge Function
-- con service_role y RPC desactivar_usuario, ambos saltan RLS).
create policy perfil_select_self_or_admin on perfil
  for select to authenticated
  using (id = (select auth.uid()) or is_admin());

-- categoria: lectura para todos; escritura solo admin.
create policy categoria_select_all on categoria
  for select to authenticated using (true);
create policy categoria_admin_write on categoria
  for all to authenticated using (is_admin()) with check (is_admin());

-- cliente: lectura para todos; crear/editar trabajador+.
create policy cliente_select_all on cliente
  for select to authenticated using (true);
create policy cliente_insert on cliente
  for insert to authenticated with check (true);
create policy cliente_update on cliente
  for update to authenticated using (true) with check (true);

-- evento: lectura para todos; crear/editar trabajador+. El autor debe ser el
-- usuario autenticado (el default rellena creado_por = auth.uid()).
create policy evento_select_all on evento
  for select to authenticated using (true);
create policy evento_insert on evento
  for insert to authenticated with check (creado_por = (select auth.uid()));
create policy evento_update on evento
  for update to authenticated using (true) with check (true);

-- producto: lectura para todos; edición de metadatos trabajador+ (los buckets
-- están vetados por privilegios de columna, no aquí). Sin INSERT/DELETE directo:
-- el alta va por registrar_entrada.
create policy producto_select_all on producto
  for select to authenticated using (true);
create policy producto_update_meta on producto
  for update to authenticated using (true) with check (true);

-- reserva: solo lectura directa. Crear/cumplir van por RPC.
create policy reserva_select_all on reserva
  for select to authenticated using (true);

-- movimiento: solo lectura directa (append-only por trigger + sin políticas de
-- escritura). Los inserta cada RPC (SECURITY DEFINER).
create policy movimiento_select_all on movimiento
  for select to authenticated using (true);
