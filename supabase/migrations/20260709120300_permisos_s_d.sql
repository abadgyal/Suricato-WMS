-- ============================================================================
-- S-D · Reajuste de permisos (nuevo reparto decidido en S-D).
-- Fuente: prompt S-D (bloque 2), docs/CONTRACTS.md §1.3.
--
-- Cambios respecto de S-B:
--   * Operaciones de stock (entrada, salida, ajuste, baja, reparado, historial,
--     dashboard) abiertas a CUALQUIER usuario autenticado. En concreto se retira
--     el chequeo is_admin() de `ajustar` y `dar_de_baja`: ya no lanzan WMS009 por
--     rol (solo lo lanzan si no hay sesión, igual que el resto de RPC).
--   * Categorías: crear/editar abiertas a cualquier autenticado (antes solo admin).
--     Se conserva DELETE solo-admin (una categoría en uso está protegida por FK).
--   * Gestión de usuarios (Edge Function crear-usuario, RPC desactivar_usuario)
--     SIGUE siendo solo admin (WMS009) — no se toca aquí.
--
-- `ajustar` y `dar_de_baja` se recrean con CREATE OR REPLACE (misma firma) para
-- borrar el bloque `if not is_admin() ... WMS009`. El resto de su cuerpo es
-- idéntico al de 20260709120100_rpc_auth.sql.
-- ============================================================================

-- ===========================================================================
-- ajustar — fija el valor de un bucket. Ahora: cualquier autenticado.
-- ===========================================================================
create or replace function ajustar(
  p_producto_id uuid,
  p_bucket      text,
  p_valor_nuevo integer,
  p_motivo      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod     producto;
  v_anterior integer;
  v_mov      uuid;
  v_uid      uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;
  -- S-D: sin chequeo de rol. Cualquier autenticado puede ajustar.
  if p_valor_nuevo is null or p_valor_nuevo < 0 then
    raise exception 'WMS002: valor inválido (p_valor_nuevo debe ser >= 0)';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'WMS003: motivo obligatorio para ajustar';
  end if;
  if p_bucket not in ('disponible', 'en_evento', 'en_reparacion') then
    raise exception 'WMS007: bucket inválido (%); use disponible|en_evento|en_reparacion', p_bucket;
  end if;

  select * into v_prod from producto where id = p_producto_id for update;
  if not found then
    raise exception 'WMS006: producto inexistente (%)', p_producto_id;
  end if;

  v_anterior := case p_bucket
                  when 'disponible'    then v_prod.disponible
                  when 'en_evento'     then v_prod.en_evento
                  when 'en_reparacion' then v_prod.en_reparacion
                end;

  update producto
    set disponible    = (case when p_bucket = 'disponible'    then p_valor_nuevo else disponible    end),
        en_evento     = (case when p_bucket = 'en_evento'     then p_valor_nuevo else en_evento     end),
        en_reparacion = (case when p_bucket = 'en_reparacion' then p_valor_nuevo else en_reparacion end),
        actualizado_en = now()
    where id = p_producto_id
    returning * into v_prod;

  insert into movimiento (tipo, producto_id, usuario_id, bucket_origen, valor_anterior, valor_nuevo, motivo)
  values ('ajuste', p_producto_id, v_uid, p_bucket::bucket, v_anterior, p_valor_nuevo, p_motivo)
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- dar_de_baja — retira unidades del total (−total). Ahora: cualquier autenticado.
-- ===========================================================================
create or replace function dar_de_baja(
  p_producto_id   uuid,
  p_unidades      integer,
  p_bucket_origen text,
  p_motivo        text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod   producto;
  v_actual integer;
  v_mov    uuid;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;
  -- S-D: sin chequeo de rol. Cualquier autenticado puede dar de baja.
  if p_unidades is null or p_unidades <= 0 then
    raise exception 'WMS002: cantidad inválida (unidades debe ser > 0)';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'WMS003: motivo obligatorio para dar de baja';
  end if;
  if p_bucket_origen not in ('disponible', 'en_evento', 'en_reparacion') then
    raise exception 'WMS007: bucket de origen inválido (%); use disponible|en_evento|en_reparacion', p_bucket_origen;
  end if;

  select * into v_prod from producto where id = p_producto_id for update;
  if not found then
    raise exception 'WMS006: producto inexistente (%)', p_producto_id;
  end if;

  v_actual := case p_bucket_origen
                when 'disponible'    then v_prod.disponible
                when 'en_evento'     then v_prod.en_evento
                when 'en_reparacion' then v_prod.en_reparacion
              end;
  if v_actual < p_unidades then
    raise exception 'WMS007: el bucket % (%) no tiene unidades suficientes para dar de baja %', p_bucket_origen, v_actual, p_unidades;
  end if;

  update producto
    set disponible    = disponible    - (case when p_bucket_origen = 'disponible'    then p_unidades else 0 end),
        en_evento     = en_evento     - (case when p_bucket_origen = 'en_evento'     then p_unidades else 0 end),
        en_reparacion = en_reparacion - (case when p_bucket_origen = 'en_reparacion' then p_unidades else 0 end),
        baja_acumulada = baja_acumulada + p_unidades,
        actualizado_en = now()
    where id = p_producto_id
    returning * into v_prod;

  insert into movimiento (tipo, producto_id, usuario_id, unidades, bucket_origen, bucket_destino, motivo)
  values ('baja', p_producto_id, v_uid, p_unidades, p_bucket_origen::bucket, 'baja', p_motivo)
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- Categorías: crear/editar para cualquier autenticado (antes solo admin).
-- DELETE se mantiene solo-admin (protege categorías en uso).
-- ===========================================================================
drop policy if exists categoria_admin_write on categoria;

create policy categoria_insert on categoria
  for insert to authenticated with check (true);
create policy categoria_update on categoria
  for update to authenticated using (true) with check (true);
create policy categoria_delete on categoria
  for delete to authenticated using (is_admin());
