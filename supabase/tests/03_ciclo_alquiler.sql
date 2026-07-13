-- ============================================================================
-- pgTAP · S-E · Ciclo de alquiler: reserva → cumplir → devolución → cierre.
-- Cubre las RPC nuevas (cancelar_reserva, cumplir_evento) y el ciclo completo
-- de punta a punta, comprobando que los buckets y el total cuadran en cada paso
-- (DOMAIN §1/§2/§4).
--
-- El runner (scripts/db-test.mjs) envuelve el fichero en BEGIN...ROLLBACK.
-- El autor de las operaciones es auth.uid(): fijamos el JWT a un trabajador de
-- fixture (todas las RPC de stock están abiertas a cualquier autenticado, S-D).
-- ============================================================================

set local request.jwt.claims = '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}';

select plan(31);

-- --- Fixtures ---------------------------------------------------------------
insert into auth.users (id) values ('bb000000-0000-0000-0000-000000000001');
insert into perfil (id, nombre, rol) values
  ('bb000000-0000-0000-0000-000000000001', 'ZZ Alquiler', 'trabajador');
insert into categoria (id, nombre, color) values
  ('bb000000-0000-0000-0000-0000000000c1', 'ZZ_TEST_ALQ', '#000000');

-- P1: el del ciclo completo. P3/P4: los de la atomicidad (P3 < P4 por id, que es
-- el orden en que cumplir_evento recorre las líneas).
insert into producto (id, nombre, categoria_id, stock_minimo, disponible) values
  ('bb000000-0000-0000-0000-0000000000a1', 'ZZ Foco LED',  'bb000000-0000-0000-0000-0000000000c1', 2, 10),
  ('bb000000-0000-0000-0000-0000000000a3', 'ZZ Truss 2m',  'bb000000-0000-0000-0000-0000000000c1', 2, 5),
  ('bb000000-0000-0000-0000-0000000000a4', 'ZZ Cable XLR', 'bb000000-0000-0000-0000-0000000000c1', 2, 2);

insert into evento (id, nombre, fecha_inicio, fecha_fin, estado, creado_por) values
  ('bb000000-0000-0000-0000-0000000000e1', 'ZZ Festival',  '2026-08-01', '2026-08-03', 'planificado', 'bb000000-0000-0000-0000-000000000001'),
  ('bb000000-0000-0000-0000-0000000000e2', 'ZZ Boda',      '2026-08-02', '2026-08-04', 'planificado', 'bb000000-0000-0000-0000-000000000001'),
  ('bb000000-0000-0000-0000-0000000000e3', 'ZZ Sin nada',  '2026-09-01', '2026-09-02', 'planificado', 'bb000000-0000-0000-0000-000000000001');


-- ===========================================================================
-- 1) Reserva: bloquea disponible_real sin mover buckets.
-- ===========================================================================
select is(
  crear_reserva('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-0000000000a1', 4, 'línea principal')->>'estado',
  'activa', 'crear_reserva deja la reserva activa');

select is(
  (select disponible_real from v_producto_disponible where id = 'bb000000-0000-0000-0000-0000000000a1'),
  6, 'la reserva activa bloquea disponible_real (10 − 4)');

select is(
  (select disponible from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  10, 'la reserva NO mueve el bucket disponible');


-- ===========================================================================
-- 2) cancelar_reserva libera el bloqueo (sin tocar stock).
-- ===========================================================================
select crear_reserva('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-0000000000a1', 3, null);

select is(
  (select disponible_real from v_producto_disponible where id = 'bb000000-0000-0000-0000-0000000000a1'),
  3, 'una segunda reserva de 3 deja disponible_real en 3 (las reservas se acumulan)');

select is(
  cancelar_reserva((select id from reserva
                    where evento_id = 'bb000000-0000-0000-0000-0000000000e1'
                      and unidades = 3 and estado = 'activa'))->>'estado',
  'cancelada', 'cancelar_reserva deja la reserva cancelada');

select is(
  (select disponible_real from v_producto_disponible where id = 'bb000000-0000-0000-0000-0000000000a1'),
  6, 'cancelar_reserva libera disponible_real (vuelve a 6)');

select is(
  (select disponible from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  10, 'cancelar_reserva no mueve buckets');


-- ===========================================================================
-- 3) cumplir_evento: materializa las reservas activas y arranca el evento.
-- ===========================================================================
select is(
  (cumplir_evento('bb000000-0000-0000-0000-0000000000e1')->>'reservas_cumplidas')::int,
  1, 'cumplir_evento materializa la única reserva activa (la cancelada no cuenta)');

select is(
  (select disponible from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  6, 'cumplir: disponible baja a 6');

select is(
  (select en_evento from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  4, 'cumplir: en_evento sube a 4');

select is(
  (select disponible + en_evento + en_reparacion from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  10, 'inv5: salir a un evento no cambia el total');

select is(
  (select estado::text from evento where id = 'bb000000-0000-0000-0000-0000000000e1'),
  'en_curso', 'cumplir: el evento pasa a en_curso');

select is(
  (select unidades_fuera from v_unidades_fuera_evento
    where evento_id = 'bb000000-0000-0000-0000-0000000000e1'
      and producto_id = 'bb000000-0000-0000-0000-0000000000a1'),
  4, 'v_unidades_fuera_evento cuenta 4 unidades fuera');


-- ===========================================================================
-- 4) Devolución parcial: 1 OK + 1 roto + 1 perdido (queda 1 fuera).
-- ===========================================================================
select is(
  (devolver('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-0000000000a1',
            1, 1, 1, 'una se rompió y otra no volvió')->>'total')::int,
  9, 'devolución parcial: la unidad perdida reduce el total a 9');

select is(
  (select disponible from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  7, 'devolución parcial: la unidad OK vuelve a disponible');

select is(
  (select en_reparacion from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  1, 'devolución parcial: la rota va a en_reparacion');

select is(
  (select baja_acumulada from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  1, 'devolución parcial: la perdida suma en baja_acumulada');

select is(
  (select unidades_fuera from v_unidades_fuera_evento
    where evento_id = 'bb000000-0000-0000-0000-0000000000e1'
      and producto_id = 'bb000000-0000-0000-0000-0000000000a1'),
  1, 'devolución parcial: sigue 1 unidad fuera');

select is(
  jsonb_array_length(
    devolver('bb000000-0000-0000-0000-0000000000e1', 'bb000000-0000-0000-0000-0000000000a1', 1, 0, 0, null)
      -> 'movimiento_ids'),
  1, 'devolver el resto genera un movimiento (retorno con movimiento_ids[])');


-- ===========================================================================
-- 5) Cierre: ya no queda nada fuera; los buckets y el total cuadran.
-- ===========================================================================
select is(
  (select en_evento from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  0, 'tras devolver todo, en_evento queda a 0');

select is(
  (select disponible from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  8, 'tras devolver todo, disponible es 8');

select is(
  (select count(*)::int from v_unidades_fuera_evento
    where evento_id = 'bb000000-0000-0000-0000-0000000000e1'),
  0, 'el evento ya no tiene material fuera');

select lives_ok(
  $$ update evento set estado = 'cerrado' where id = 'bb000000-0000-0000-0000-0000000000e1' $$,
  'el evento sin material fuera se puede cerrar');

select is(
  (select disponible + en_evento + en_reparacion from producto where id = 'bb000000-0000-0000-0000-0000000000a1'),
  9, 'inv1/5: total final = 10 − 1 perdida; solo la pérdida lo redujo');


-- ===========================================================================
-- 6) Errores de estado (WMS004).
-- ===========================================================================
select throws_like(
  format($$ select cancelar_reserva(%L) $$,
         (select id from reserva where evento_id = 'bb000000-0000-0000-0000-0000000000e1' and estado = 'cumplida')),
  '%WMS004%', 'WMS004: no se puede cancelar una reserva ya cumplida');

select throws_like(
  $$ select cumplir_evento('bb000000-0000-0000-0000-0000000000e3') $$,
  '%WMS004%', 'WMS004: cumplir un evento sin reservas activas falla');


-- ===========================================================================
-- 7) Atomicidad de cumplir_evento: si una línea no cabe, no sale ninguna.
--    E2 reserva 5 de Truss (a3, cabe) y 2 de Cable (a4, cabe al reservar).
--    Damos de baja las 2 unidades de Cable: su reserva deja de caber.
--    cumplir_evento recorre por producto_id (a3 antes que a4): la línea de Truss
--    se materializa primero y DEBE revertirse cuando falla la de Cable.
-- ===========================================================================
select crear_reserva('bb000000-0000-0000-0000-0000000000e2', 'bb000000-0000-0000-0000-0000000000a3', 5, null);
select crear_reserva('bb000000-0000-0000-0000-0000000000e2', 'bb000000-0000-0000-0000-0000000000a4', 2, null);
select dar_de_baja('bb000000-0000-0000-0000-0000000000a4', 2, 'disponible', 'destrozado en almacén');

select throws_like(
  $$ select cumplir_evento('bb000000-0000-0000-0000-0000000000e2') $$,
  '%WMS001%', 'cumplir_evento falla con WMS001 si una línea no tiene stock');

select is(
  (select disponible from producto where id = 'bb000000-0000-0000-0000-0000000000a3'),
  5, 'atomicidad: el producto de la línea que SÍ cabía no salió (disponible intacto)');

select is(
  (select en_evento from producto where id = 'bb000000-0000-0000-0000-0000000000a3'),
  0, 'atomicidad: ninguna unidad llegó a en_evento');

select is(
  (select estado::text from reserva
    where evento_id = 'bb000000-0000-0000-0000-0000000000e2'
      and producto_id = 'bb000000-0000-0000-0000-0000000000a3'),
  'activa', 'atomicidad: la reserva que se materializó queda revertida a activa');

select is(
  (select estado::text from evento where id = 'bb000000-0000-0000-0000-0000000000e2'),
  'planificado', 'atomicidad: el evento no arranca si la salida no se completó');

select * from finish();
