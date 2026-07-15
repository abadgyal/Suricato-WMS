-- ############################################################################
-- ##                                                                        ##
-- ##   ⚠  PURGA DE DATOS DE PRUEBA — OPERACIÓN IRREVERSIBLE  ⚠              ##
-- ##                                                                        ##
-- ##   Este script BORRA de forma permanente TODOS los datos de negocio     ##
-- ##   (movimientos, reservas, eventos, productos y clientes) y las cuentas ##
-- ##   de demostración (%@suricato.local). NO hay "deshacer".               ##
-- ##                                                                        ##
-- ##   ANTES DE EJECUTARLO:                                                  ##
-- ##     1. Ten un BACKUP reciente y verificado de la base de datos         ##
-- ##        (el workflow `backup.yml` genera un pg_dump; ver docs/DEPLOY.md).##
-- ##     2. Confirma que es la BASE DE PRODUCCIÓN correcta.                  ##
-- ##     3. Confirma que el admin real (jaime.abad@…) ya está creado y es   ##
-- ##        el `es_principal` (ver docs/BOOTSTRAP.md).                       ##
-- ##                                                                        ##
-- ##   NO lo ejecuta Claude. Lo lanza el humano, una sola vez, en           ##
-- ##   septiembre, justo antes del go-live. Ver docs/PURGE.md.              ##
-- ##                                                                        ##
-- ##   Ejecútalo como rol `postgres` (SQL Editor del Dashboard o psql con   ##
-- ##   la cadena de servicio): desactiva un trigger de tabla, lo que exige  ##
-- ##   ser propietario de la tabla.                                         ##
-- ##                                                                        ##
-- ##   Es idempotente y va dentro de UNA transacción: si algo falla, no     ##
-- ##   deja la base a medias (rollback total).                              ##
-- ##                                                                        ##
-- ##   PRESERVA: el esquema, las RPC, las vistas, las políticas RLS, el     ##
-- ##   admin real, y deja las 6 categorías por defecto.                     ##
-- ##                                                                        ##
-- ############################################################################

begin;

-- ---------------------------------------------------------------------------
-- 0) Blindaje del admin principal.
--    El trigger BEFORE DELETE de `perfil` (WMS_PRINCIPAL) impide borrar al
--    es_principal, y se dispara también en los DELETE en cascada desde
--    auth.users. Si —por lo que sea— el principal fuese aún una cuenta demo
--    (bootstrap no ejecutado), lo degradamos ANTES para que el borrado en
--    cascada del paso 6 no reviente. El admin real (que NO es @suricato.local)
--    conserva su condición de principal intacta.
-- ---------------------------------------------------------------------------
update perfil set es_principal = false
where es_principal
  and id in (select id from auth.users where email ilike '%@suricato.local');

-- ---------------------------------------------------------------------------
-- 1) Movimientos (log append-only). La tabla tiene un trigger de inmutabilidad
--    (WMS_INMUTABLE) que prohíbe DELETE. Lo desactivamos SOLO para esta
--    transacción y lo reactivamos justo después; si el script aborta, el
--    rollback restaura el trigger igualmente (el DDL es transaccional).
-- ---------------------------------------------------------------------------
alter table movimiento disable trigger trg_movimiento_no_delete;
delete from movimiento;
alter table movimiento enable trigger trg_movimiento_no_delete;

-- ---------------------------------------------------------------------------
-- 2)–5) Resto de datos de negocio, en orden de FKs (de hijo a padre).
--    reserva → evento → producto → cliente. (Las FKs de auditoría son
--    ON DELETE RESTRICT, así que el orden importa; los movimientos ya no están.)
-- ---------------------------------------------------------------------------
delete from reserva;
delete from evento;
delete from producto;
delete from cliente;

-- ---------------------------------------------------------------------------
-- 6) Cuentas de auth de demostración (%@suricato.local) y sus perfiles.
--    Borrar el usuario de auth CASCADEA al perfil (perfil_id_fkey ON DELETE
--    CASCADE) y a sus identities/sessions. El filtro por dominio deja fuera al
--    admin real por construcción. Cubre las cuentas demo del seed
--    (admin.demo@, trabajador.demo@) y las de prueba (trabajador.sf@).
-- ---------------------------------------------------------------------------
delete from auth.users where email ilike '%@suricato.local';

-- ---------------------------------------------------------------------------
-- 7) Categorías: dejar EXACTAMENTE las 6 por defecto (DOMAIN §3.2).
--    Se borra cualquier categoría extra (sus productos ya no existen; además
--    producto.categoria_id es ON DELETE SET NULL desde S-F) y se re-crean las 6
--    si faltara alguna. El color lo asigna el trigger determinista por nombre
--    (`trg_categoria_color`), así que no hace falta indicarlo.
-- ---------------------------------------------------------------------------
delete from categoria
where nombre not in ('Audio', 'Vídeo', 'Iluminación', 'Estructuras', 'Consumibles', 'Otros');

insert into categoria (nombre) values
  ('Audio'), ('Vídeo'), ('Iluminación'), ('Estructuras'), ('Consumibles'), ('Otros')
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- 8) Verificación (informativa). Deben quedar 0 filas de negocio, 6 categorías
--    y al menos un admin activo. Si no hay ningún admin, algo va mal: aborta.
-- ---------------------------------------------------------------------------
do $$
declare
  v_negocio integer;
  v_cats    integer;
  v_admins  integer;
begin
  select
    (select count(*) from movimiento)
  + (select count(*) from reserva)
  + (select count(*) from evento)
  + (select count(*) from producto)
  + (select count(*) from cliente)
  into v_negocio;

  select count(*) into v_cats from categoria;
  select count(*) into v_admins from perfil where rol = 'admin' and activo;

  raise notice 'purga: filas de negocio restantes = % (esperado 0)', v_negocio;
  raise notice 'purga: categorías restantes = % (esperado 6)', v_cats;
  raise notice 'purga: admins activos restantes = %', v_admins;

  if v_admins = 0 then
    raise exception 'purga abortada: no queda ningún admin activo. ¿Creaste el admin real (docs/BOOTSTRAP.md) antes de purgar?';
  end if;
end $$;

commit;

-- Tras el COMMIT: base limpia, lista para el go-live. Verifica en la app que el
-- inventario, el historial y la cartera de clientes están vacíos y que puedes
-- iniciar sesión con el admin real.
