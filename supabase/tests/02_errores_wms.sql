-- ============================================================================
-- pgTAP · Casos de error WMS de las RPC (CONTRACTS §1.2) e invariantes 3 y 4
-- (las reservas activas bloquean disponible_real). Envuelto en BEGIN...ROLLBACK
-- por el runner.
-- ============================================================================

select plan(15);

-- --- Fixtures --------------------------------------------------------------
insert into perfil (id, nombre, rol) values
  ('bb000000-0000-0000-0000-000000000001', 'Test Worker 2', 'trabajador');
insert into categoria (id, nombre, color) values
  ('bb000000-0000-0000-0000-0000000000c1', 'ZZ_TEST_ERR', '#111111');
insert into evento (id, nombre, fecha_inicio, fecha_fin, estado, creado_por) values
  ('bb000000-0000-0000-0000-0000000000e1', 'ZZ Evt Err', '2026-07-01', '2026-07-05', 'planificado', 'bb000000-0000-0000-0000-000000000001');
insert into producto (id, nombre, categoria_id, disponible) values
  ('bb000000-0000-0000-0000-0000000000a1', 'ZZ P1', 'bb000000-0000-0000-0000-0000000000c1', 2),
  ('bb000000-0000-0000-0000-0000000000a2', 'ZZ P2', 'bb000000-0000-0000-0000-0000000000c1', 5),
  ('bb000000-0000-0000-0000-0000000000a3', 'ZZ P3', 'bb000000-0000-0000-0000-0000000000c1', 5),
  ('bb000000-0000-0000-0000-0000000000a4', 'ZZ P4', 'bb000000-0000-0000-0000-0000000000c1', 3);

-- --- WMS002 / WMS001 en salida_evento --------------------------------------
select throws_like($$ select salida_evento('bb000000-0000-0000-0000-0000000000a1', 0, 'bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-000000000001') $$,
  '%WMS002%', 'WMS002: salida con unidades = 0');
select throws_like($$ select salida_evento('bb000000-0000-0000-0000-0000000000a1', 5, 'bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-000000000001') $$,
  '%WMS001%', 'WMS001: salida sin stock (5 > 2 disponible)');

-- --- WMS001 en crear_reserva + invariantes 3/4 -----------------------------
select throws_like($$ select crear_reserva('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-0000000000a1', 5, 'bb000000-0000-0000-0000-000000000001') $$,
  '%WMS001%', 'WMS001: reservar más que disponible_real (5 > 2)');
select lives_ok($$ select crear_reserva('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-0000000000a1', 2, 'bb000000-0000-0000-0000-000000000001') $$,
  'inv3: reservar exactamente el disponible_real se permite');
select throws_like($$ select salida_evento('bb000000-0000-0000-0000-0000000000a1', 1, 'bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-000000000001') $$,
  '%WMS001%', 'inv4: la reserva activa bloquea la salida (disponible_real = 0)');

-- --- WMS006: producto inexistente ------------------------------------------
select throws_like($$ select salida_evento('bb000000-0000-0000-0000-0000000000ff', 1, 'bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-000000000001') $$,
  '%WMS006%', 'WMS006: producto inexistente');

-- --- WMS005: devolución excede lo que está fuera ---------------------------
select lives_ok($$ select salida_evento('bb000000-0000-0000-0000-0000000000a2', 3, 'bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-000000000001') $$,
  'salida de 3 unidades (prepara devolución)');
select throws_like($$ select devolver('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-0000000000a2', 4, 0, 0, 'bb000000-0000-0000-0000-000000000001') $$,
  '%WMS005%', 'WMS005: devolver 4 con solo 3 fuera');
select lives_ok($$ select devolver('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-0000000000a2', 3, 0, 0, 'bb000000-0000-0000-0000-000000000001') $$,
  'devolver exactamente lo que está fuera se permite');

-- --- WMS003 / WMS002 / WMS007 en ajustar y dar_de_baja ---------------------
select throws_like($$ select ajustar('bb000000-0000-0000-0000-0000000000a3', 'disponible', 5, 'bb000000-0000-0000-0000-000000000001', '') $$,
  '%WMS003%', 'WMS003: ajuste sin motivo');
select throws_like($$ select dar_de_baja('bb000000-0000-0000-0000-0000000000a3', 1, 'disponible', 'bb000000-0000-0000-0000-000000000001', '   ') $$,
  '%WMS003%', 'WMS003: baja sin motivo (solo espacios)');
select throws_like($$ select ajustar('bb000000-0000-0000-0000-0000000000a3', 'disponible', -1, 'bb000000-0000-0000-0000-000000000001', 'x') $$,
  '%WMS002%', 'WMS002: ajuste a valor negativo');
select throws_like($$ select dar_de_baja('bb000000-0000-0000-0000-0000000000a3', 999, 'en_reparacion', 'bb000000-0000-0000-0000-000000000001', 'x') $$,
  '%WMS007%', 'WMS007: baja de un bucket sin unidades suficientes');

-- --- WMS003 en devolver con pérdida sin motivo -----------------------------
select lives_ok($$ select salida_evento('bb000000-0000-0000-0000-0000000000a4', 3, 'bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-000000000001') $$,
  'salida de 3 (prepara devolución con pérdida)');
select throws_like($$ select devolver('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-0000000000a4', 0, 0, 1, 'bb000000-0000-0000-0000-000000000001') $$,
  '%WMS003%', 'WMS003: devolución con perdido > 0 sin motivo');

select * from finish();
