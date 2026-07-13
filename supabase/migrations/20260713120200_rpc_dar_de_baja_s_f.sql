-- ============================================================================
-- S-F · `dar_de_baja` prohíbe `en_evento` como bucket de origen (Opción A).
--
-- Bug heredado (DEBT [S-E]): dar de baja unidades cuyo origen era `en_evento`
-- bajaba el contador `producto.en_evento` pero NO escribía un movimiento ligado
-- al evento, así que `v_unidades_fuera_evento` (Σ salidas − Σ devoluciones,
-- CONTRACTS §1.4) seguía contando esas unidades como fuera. Material fantasma:
-- el evento no llegaba nunca a "0 fuera" (no se podía cerrar) y una devolución
-- posterior podía pasar WMS005 y chocar contra el CHECK de `en_evento >= 0`.
--
-- Decisión (S-F): `dar_de_baja` solo admite `disponible` y `en_reparacion`. El
-- camino correcto para material que se pierde en un evento es el check-in de
-- devolución con unidades «perdidas» (`devolver` con `p_perdido`, CONTRACTS
-- §2.5), que sí escribe el movimiento con `evento_id` y cuadra la vista.
--
-- El error se emite como WMS007 (bucket de origen inválido para la operación),
-- con un mensaje que indica explícitamente el camino correcto.
-- ============================================================================

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

  -- S-F: `en_evento` NO es un origen válido de baja. El material que se pierde
  -- en un evento se registra en el check-in de devolución como «perdido», que
  -- liga el movimiento a su evento y mantiene cuadrada v_unidades_fuera_evento.
  if p_bucket_origen = 'en_evento' then
    raise exception 'WMS007: no se puede dar de baja material que está en un evento. Regístralo en el check-in de devolución del evento como unidades «perdidas» (devolver con p_perdido), que liga la baja a su evento';
  end if;
  if p_bucket_origen not in ('disponible', 'en_reparacion') then
    raise exception 'WMS007: bucket de origen inválido (%); use disponible|en_reparacion', p_bucket_origen;
  end if;

  select * into v_prod from producto where id = p_producto_id for update;
  if not found then
    raise exception 'WMS006: producto inexistente (%)', p_producto_id;
  end if;

  v_actual := case p_bucket_origen
                when 'disponible'    then v_prod.disponible
                when 'en_reparacion' then v_prod.en_reparacion
              end;
  if v_actual < p_unidades then
    raise exception 'WMS007: el bucket % (%) no tiene unidades suficientes para dar de baja %', p_bucket_origen, v_actual, p_unidades;
  end if;

  update producto
    set disponible    = disponible    - (case when p_bucket_origen = 'disponible'    then p_unidades else 0 end),
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

comment on function dar_de_baja(uuid, integer, text, text) is
  'Retira unidades del total (CONTRACTS §2.7). Origen: disponible | en_reparacion. '
  'en_evento NO es válido: usa devolver() con p_perdido para el material perdido en un evento.';
