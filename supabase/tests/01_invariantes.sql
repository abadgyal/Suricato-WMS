-- ============================================================================
-- pgTAP · Invariantes 1-8 (DOMAIN §4) + WMS008, a través del ciclo de RPC.
-- El runner (scripts/db-test.mjs) envuelve este fichero en BEGIN...ROLLBACK,
-- así que las fixtures no ensucian la BD.
-- ============================================================================

select plan(16);

-- --- Fixtures (UUIDs de test, se revierten con el rollback) ----------------
-- El admin principal para el test de invariante 8 es el del seed
-- (11111111-…): sólo puede existir uno (ux_perfil_principal), así que no se
-- crea otro aquí.
insert into perfil (id, nombre, rol, es_principal) values
  ('aa000000-0000-0000-0000-000000000001', 'Test Worker', 'trabajador', false);
insert into categoria (id, nombre, color) values
  ('aa000000-0000-0000-0000-0000000000c1', 'ZZ_TEST_INV', '#000000');
insert into producto (id, nombre, categoria_id, stock_minimo, disponible) values
  ('aa000000-0000-0000-0000-0000000000a1', 'ZZ Prod Inv', 'aa000000-0000-0000-0000-0000000000c1', 5, 10);
insert into evento (id, nombre, fecha_inicio, fecha_fin, estado, creado_por) values
  ('aa000000-0000-0000-0000-0000000000e1', 'ZZ Evt Inv', '2026-07-01', '2026-07-05', 'planificado', 'aa000000-0000-0000-0000-000000000001');

-- --- Invariantes 1 y 5: conservación del total a lo largo del ciclo --------
select is(
  (salida_evento('aa000000-0000-0000-0000-0000000000a1', 3, 'aa000000-0000-0000-0000-0000000000e1', 'aa000000-0000-0000-0000-000000000001')->>'total')::int,
  10, 'inv1/5: salida a evento no cambia el total');
select is((select en_evento from producto where id = 'aa000000-0000-0000-0000-0000000000a1'), 3,
  'salida mueve unidades a en_evento');
select is(
  (devolver('aa000000-0000-0000-0000-0000000000e1', 'aa000000-0000-0000-0000-0000000000a1', 1, 1, 1, 'aa000000-0000-0000-0000-000000000001', 'rotura y pérdida')->>'total')::int,
  9, 'inv5: la unidad perdida reduce el total en 1');
select is((select disponible from producto where id = 'aa000000-0000-0000-0000-0000000000a1'), 8,
  'devolver OK suma a disponible');
select is((select en_reparacion from producto where id = 'aa000000-0000-0000-0000-0000000000a1'), 1,
  'devolver roto suma a en_reparacion');
select is((select baja_acumulada from producto where id = 'aa000000-0000-0000-0000-0000000000a1'), 1,
  'devolver perdido suma a baja_acumulada');
select is(
  (marcar_reparado('aa000000-0000-0000-0000-0000000000a1', 1, 'aa000000-0000-0000-0000-000000000001')->>'total')::int,
  9, 'reparado no cambia el total');
select is(
  (dar_de_baja('aa000000-0000-0000-0000-0000000000a1', 2, 'disponible', 'aa000000-0000-0000-0000-000000000001', 'obsoleto')->>'total')::int,
  7, 'inv5: la baja reduce el total');
select is(
  (ajustar('aa000000-0000-0000-0000-0000000000a1', 'disponible', 5, 'aa000000-0000-0000-0000-000000000001', 'recuento físico')->>'disponible')::int,
  5, 'ajuste fija el valor del bucket');

-- --- Invariante 2: ningún bucket negativo (CHECK) --------------------------
select throws_like($$ update producto set disponible = -1 where id = 'aa000000-0000-0000-0000-0000000000a1' $$,
  '%producto_disponible_no_negativo%', 'inv2: disponible no puede ser negativo');

-- --- Invariante 6: movimiento inmutable (sin UPDATE/DELETE) ----------------
select throws_like($$ update movimiento set unidades = 999 where producto_id = 'aa000000-0000-0000-0000-0000000000a1' $$,
  '%inmutable%', 'inv6: no se permite UPDATE en movimiento');
select throws_like($$ delete from movimiento where producto_id = 'aa000000-0000-0000-0000-0000000000a1' $$,
  '%inmutable%', 'inv6: no se permite DELETE en movimiento');

-- --- Invariante 7: motivo obligatorio en ajuste/baja (CHECK) ---------------
select throws_like($$ insert into movimiento (tipo, producto_id, usuario_id, bucket_origen, valor_anterior, valor_nuevo)
  values ('ajuste', 'aa000000-0000-0000-0000-0000000000a1', 'aa000000-0000-0000-0000-000000000001', 'disponible', 5, 6) $$,
  '%movimiento_motivo_obligatorio%', 'inv7: ajuste sin motivo viola el CHECK');

-- --- Invariante 8: admin principal no se elimina; baja lógica sí -----------
-- Se prueba contra el admin principal del seed (11111111-…); el rollback del
-- runner revierte la baja lógica.
select throws_like($$ delete from perfil where id = '11111111-1111-1111-1111-111111111111' $$,
  '%WMS_PRINCIPAL%', 'inv8: el admin principal no puede eliminarse');
select lives_ok($$ update perfil set activo = false where id = '11111111-1111-1111-1111-111111111111' $$,
  'inv8: la baja lógica del principal sí se permite');

-- --- WMS008: rango de fechas de evento -------------------------------------
select throws_like($$ insert into evento (nombre, fecha_inicio, fecha_fin, creado_por)
  values ('mal', '2026-07-10', '2026-07-01', 'aa000000-0000-0000-0000-000000000001') $$,
  '%evento_fechas_validas%', 'WMS008: fecha_fin >= fecha_inicio');

select * from finish();
