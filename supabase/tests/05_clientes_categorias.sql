-- ============================================================================
-- pgTAP · S-F: color de cliente/categoría y borrado de categoría.
--
--   * `cliente.color` nunca queda vacío: lo asigna un trigger determinista.
--   * `categoria.color` idem, a partir del nombre (habilita el alta en línea
--     desde el formulario de Entrada, deuda [S-D]).
--   * Al borrar una categoría, sus productos NO se borran: quedan sin categoría
--     (`categoria_id` → NULL) y el histórico de movimientos queda intacto.
-- Envuelto en BEGIN...ROLLBACK por el runner.
-- ============================================================================

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select plan(10);

-- --- Color de cliente -------------------------------------------------------
insert into cliente (id, nombre) values
  ('dd000000-0000-0000-0000-0000000000c1', 'ZZ Cliente SF');

select isnt(
  (select color from cliente where id = 'dd000000-0000-0000-0000-0000000000c1'),
  null, 'cliente creado sin color: el trigger le pone uno');

select ok(
  (select color from cliente where id = 'dd000000-0000-0000-0000-0000000000c1')
    = any (wms_paleta_cliente()),
  'el color del cliente sale de la paleta de clientes');

select is(
  (select color from cliente where id = 'dd000000-0000-0000-0000-0000000000c1'),
  wms_color_cliente('dd000000-0000-0000-0000-0000000000c1'),
  'el color es determinista por id');

-- Un color explícito se respeta (cambio desde la ficha).
update cliente set color = '#5F8A8B' where id = 'dd000000-0000-0000-0000-0000000000c1';
select is(
  (select color from cliente where id = 'dd000000-0000-0000-0000-0000000000c1'),
  '#5F8A8B', 'el color del cliente se puede cambiar');

-- --- Color de categoría (alta en línea) -------------------------------------
insert into categoria (id, nombre) values
  ('dd000000-0000-0000-0000-0000000000a1', 'ZZ_TEST_RIGGING');

select is(
  (select color from categoria where id = 'dd000000-0000-0000-0000-0000000000a1'),
  wms_color_categoria('ZZ_TEST_RIGGING'),
  'categoría creada sin color: color determinista por nombre');

select ok(
  (select color from categoria where id = 'dd000000-0000-0000-0000-0000000000a1')
    = any (wms_paleta_categoria()),
  'el color de la categoría sale de la paleta de categorías');

-- --- Borrado de categoría: los productos quedan sin categoría ---------------
insert into producto (id, nombre, categoria_id, disponible) values
  ('dd000000-0000-0000-0000-00000000d1f1', 'ZZ Prod SF', 'dd000000-0000-0000-0000-0000000000a1', 5);

select lives_ok($$ select salida_evento('dd000000-0000-0000-0000-00000000d1f1', 2, 'e1111111-1111-1111-1111-111111111111') $$,
  'el producto tiene histórico (una salida a evento)');

delete from categoria where id = 'dd000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*)::integer from producto where id = 'dd000000-0000-0000-0000-00000000d1f1'),
  1, 'borrar la categoría NO borra sus productos');

select is(
  (select categoria_id from producto where id = 'dd000000-0000-0000-0000-00000000d1f1'),
  null, 'los productos quedan sin categoría (categoria_id = NULL)');

select is(
  (select count(*)::integer from movimiento where producto_id = 'dd000000-0000-0000-0000-00000000d1f1'),
  1, 'el histórico de movimientos queda intacto');

select * from finish();
