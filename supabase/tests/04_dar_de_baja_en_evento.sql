-- ============================================================================
-- pgTAP · S-F: `dar_de_baja` prohíbe `en_evento` como bucket de origen.
--
-- Regresión del bug heredado (DEBT [S-E]): bajar material desde `en_evento`
-- descuadraba `v_unidades_fuera_evento` (movimiento sin `evento_id`) y dejaba
-- material fantasma. El camino correcto es `devolver` con `p_perdido`.
-- Envuelto en BEGIN...ROLLBACK por el runner.
-- ============================================================================

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select plan(9);

-- --- Fixtures --------------------------------------------------------------
insert into auth.users (id) values ('cc000000-0000-0000-0000-000000000001');
insert into perfil (id, nombre, rol) values
  ('cc000000-0000-0000-0000-000000000001', 'Test Worker F', 'trabajador');
insert into categoria (id, nombre, color) values
  ('cc000000-0000-0000-0000-0000000000c1', 'ZZ_TEST_SF', '#111111');
insert into evento (id, nombre, fecha_inicio, fecha_fin, estado, creado_por) values
  ('cc000000-0000-0000-0000-0000000000e1', 'ZZ Evt SF', '2026-07-01', '2026-07-05', 'en_curso', 'cc000000-0000-0000-0000-000000000001');
insert into producto (id, nombre, categoria_id, disponible, en_reparacion) values
  ('cc000000-0000-0000-0000-0000000000a1', 'ZZ SF P1', 'cc000000-0000-0000-0000-0000000000c1', 10, 2);

-- 4 unidades salen al evento: disponible 10 → 6, en_evento 0 → 4.
select lives_ok($$ select salida_evento('cc000000-0000-0000-0000-0000000000a1', 4, 'cc000000-0000-0000-0000-0000000000e1') $$,
  'salida de 4 unidades al evento (prepara el caso)');

-- --- El caso: dar_de_baja desde en_evento falla ----------------------------
select throws_like($$ select dar_de_baja('cc000000-0000-0000-0000-0000000000a1', 1, 'en_evento', 'se perdió en el evento') $$,
  '%WMS007%', 'WMS007: dar_de_baja con origen en_evento falla');

-- El mensaje remite al camino correcto (check-in de devolución con perdidas).
select throws_like($$ select dar_de_baja('cc000000-0000-0000-0000-0000000000a1', 1, 'en_evento', 'se perdió en el evento') $$,
  '%check-in%', 'el error remite al check-in de devolución');

-- No ha tocado nada: el bucket en_evento sigue intacto...
select is(
  (select en_evento from producto where id = 'cc000000-0000-0000-0000-0000000000a1'),
  4, 'en_evento intacto tras el intento de baja');

-- ...y la vista de material fuera sigue cuadrada (4 fuera, sin fantasmas).
select is(
  (select unidades_fuera from v_unidades_fuera_evento
    where producto_id = 'cc000000-0000-0000-0000-0000000000a1'
      and evento_id   = 'cc000000-0000-0000-0000-0000000000e1'),
  4, 'v_unidades_fuera_evento sigue contando 4 fuera');

-- --- Los orígenes válidos siguen funcionando -------------------------------
select lives_ok($$ select dar_de_baja('cc000000-0000-0000-0000-0000000000a1', 2, 'disponible', 'rotas en almacén') $$,
  'dar_de_baja desde disponible sigue funcionando');
select lives_ok($$ select dar_de_baja('cc000000-0000-0000-0000-0000000000a1', 1, 'en_reparacion', 'irreparable') $$,
  'dar_de_baja desde en_reparacion sigue funcionando');

-- --- El camino correcto: devolver con perdidas ------------------------------
select lives_ok($$ select devolver('cc000000-0000-0000-0000-0000000000e1', 'cc000000-0000-0000-0000-0000000000a1', 3, 0, 1, 'perdida en el evento') $$,
  'devolver con p_perdido = 1 sí registra la pérdida del evento');

-- Tras el check-in completo (3 ok + 1 perdida) el evento se queda a 0 fuera:
-- ya no hay material fantasma y el evento se puede cerrar.
select is(
  (select count(*)::integer from v_unidades_fuera_evento
    where evento_id = 'cc000000-0000-0000-0000-0000000000e1'),
  0, 'el evento queda sin material fuera (cerrable)');

select * from finish();
