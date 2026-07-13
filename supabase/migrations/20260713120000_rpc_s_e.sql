-- ============================================================================
-- S-E · Ciclo de alquiler: RPC nuevas del ciclo reserva → salida → devolución.
-- Fuente: docs/CONTRACTS.md §2.9/§2.10, docs/DOMAIN.md §2/§5, prompt S-E.
--
-- Añade:
--   * cancelar_reserva — libera el bloqueo de una reserva activa. NO mueve
--     buckets ni escribe movimiento (una reserva es una capa lógica sobre
--     `disponible`, DOMAIN §1: cancelarla no es un hecho físico).
--   * cumplir_evento — materializa TODAS las reservas activas del evento de una
--     vez, reutilizando cumplir_reserva. Atómico: si una sola no cabe, la
--     excepción se propaga y la transacción revierte todas las anteriores.
--
-- Reescribe (misma firma, CREATE OR REPLACE):
--   * cumplir_reserva — además de mover el stock, pasa el evento a `en_curso`
--     si estaba `planificado` (SPEC §9: hay material fuera ⇒ el evento está en
--     marcha). El resto del cuerpo es idéntico al de 20260709120100_rpc_auth.sql.
--
-- Convenciones heredadas: SECURITY DEFINER + search_path fijo, autor =
-- auth.uid() (nunca un id del cliente), errores 'WMSNNN: mensaje', FOR UPDATE
-- sobre la fila de producto antes de tocar buckets.
-- ============================================================================


-- ===========================================================================
-- 2.3 cumplir_reserva — materializa una reserva: disponible → en_evento.
--     S-E: arrastra el evento a `en_curso`.
-- ===========================================================================
create or replace function cumplir_reserva(
  p_reserva_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva   reserva;
  v_prod      producto;
  v_disp_real integer;
  v_mov       uuid;
  v_uid       uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;

  select * into v_reserva from reserva where id = p_reserva_id for update;
  if not found then
    raise exception 'WMS004: reserva inexistente o no está activa (%)', p_reserva_id;
  end if;
  if v_reserva.estado <> 'activa' then
    raise exception 'WMS004: la reserva no está activa (estado %)', v_reserva.estado;
  end if;

  select * into v_prod from producto where id = v_reserva.producto_id for update;
  if not found then
    raise exception 'WMS006: producto inexistente (%)', v_reserva.producto_id;
  end if;

  -- disponible_real EXCLUYENDO esta reserva: al cumplirla se consumen sus
  -- propias unidades, y debe seguir cubriéndose el resto de reservas activas.
  v_disp_real := v_prod.disponible - _wms_reservas_activas(v_prod.id, p_reserva_id);
  if v_disp_real < v_reserva.unidades then
    raise exception 'WMS001: stock insuficiente para cumplir la reserva (disponible_real % < %)', v_disp_real, v_reserva.unidades;
  end if;

  update producto
    set disponible = disponible - v_reserva.unidades,
        en_evento  = en_evento  + v_reserva.unidades,
        actualizado_en = now()
    where id = v_prod.id
    returning * into v_prod;

  update reserva set estado = 'cumplida' where id = p_reserva_id;

  insert into movimiento (tipo, producto_id, evento_id, usuario_id, unidades, bucket_origen, bucket_destino)
  values ('salida_evento', v_prod.id, v_reserva.evento_id, v_uid, v_reserva.unidades, 'disponible', 'en_evento')
  returning id into v_mov;

  -- S-E: hay material fuera ⇒ el evento está en marcha.
  update evento set estado = 'en_curso'
    where id = v_reserva.evento_id and estado = 'planificado';

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.9 cancelar_reserva — libera una reserva activa (SPEC §8).
--     Sin movimiento de stock: la reserva bloquea `disponible_real`, no mueve
--     buckets, así que cancelarla solo devuelve ese margen (DOMAIN §1/§5).
--     Errores: WMS004 (no existe o no está activa), WMS009 (sin sesión).
--     Retorno: la fila `reserva` actualizada (igual que crear_reserva).
-- ===========================================================================
create or replace function cancelar_reserva(
  p_reserva_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva reserva;
  v_uid     uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;

  select * into v_reserva from reserva where id = p_reserva_id for update;
  if not found then
    raise exception 'WMS004: reserva inexistente (%)', p_reserva_id;
  end if;
  if v_reserva.estado <> 'activa' then
    raise exception 'WMS004: solo se puede cancelar una reserva activa (estado %)', v_reserva.estado;
  end if;

  update reserva set estado = 'cancelada' where id = p_reserva_id
  returning * into v_reserva;

  return to_jsonb(v_reserva);
end;
$$;


-- ===========================================================================
-- 2.10 cumplir_evento — materializa de una vez todas las reservas activas del
--      evento. Reutiliza cumplir_reserva línea a línea.
--
--      ATOMICIDAD: si una línea falla (p. ej. WMS001), la excepción se propaga
--      fuera de la función y la transacción del cliente revierte TODO — las
--      líneas ya materializadas incluidas. O salen todas, o no sale ninguna.
--      El bloque EXCEPTION solo enriquece el mensaje para decir qué producto
--      falló; vuelve a lanzar, nunca traga el error.
--
--      Las reservas se recorren ordenadas por producto_id: así dos
--      cumplir_evento concurrentes toman los FOR UPDATE en el mismo orden y no
--      se abrazan en un interbloqueo.
--
--      Errores: WMS006 (evento inexistente), WMS004 (evento no vivo / sin
--      reservas activas), WMS001 (stock insuficiente en alguna línea), WMS009.
-- ===========================================================================
create or replace function cumplir_evento(
  p_evento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento    evento;
  v_linea     record;
  v_estado    jsonb;
  v_lineas    jsonb := '[]'::jsonb;
  v_movs      uuid[] := array[]::uuid[];
  v_n         integer := 0;
  v_unidades  integer := 0;
  v_err       text;
  v_uid       uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;

  select * into v_evento from evento where id = p_evento_id for update;
  if not found then
    raise exception 'WMS006: evento inexistente (%)', p_evento_id;
  end if;
  if v_evento.estado not in ('planificado', 'en_curso') then
    raise exception 'WMS004: el evento está % y no admite salidas de material', v_evento.estado;
  end if;

  for v_linea in
    select r.id, r.unidades, p.nombre
    from reserva r
    join producto p on p.id = r.producto_id
    where r.evento_id = p_evento_id
      and r.estado = 'activa'
    order by r.producto_id, r.creado_en
  loop
    begin
      v_estado := cumplir_reserva(v_linea.id);
    exception when others then
      -- Se re-lanza: aborta la función entera y con ella las líneas anteriores.
      v_err := sqlerrm;
      raise exception '%. Falló en «%» (unidades: %): no se ha materializado ninguna reserva del evento.',
        v_err, v_linea.nombre, v_linea.unidades;
    end;

    v_n        := v_n + 1;
    v_unidades := v_unidades + v_linea.unidades;
    v_movs     := v_movs || (v_estado->>'movimiento_id')::uuid;
    v_lineas   := v_lineas || jsonb_build_object(
      'reserva_id',  v_linea.id,
      'producto_id', v_estado->>'producto_id',
      'producto',    v_linea.nombre,
      'unidades',    v_linea.unidades
    );
  end loop;

  if v_n = 0 then
    raise exception 'WMS004: el evento no tiene reservas activas que cumplir';
  end if;

  -- cumplir_reserva ya dejó el evento en_curso; lo releemos para devolver el
  -- estado real.
  select * into v_evento from evento where id = p_evento_id;

  return jsonb_build_object(
    'evento_id',          v_evento.id,
    'estado',             v_evento.estado,
    'reservas_cumplidas', v_n,
    'unidades',           v_unidades,
    'lineas',             v_lineas,
    'movimiento_ids',     to_jsonb(v_movs)
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- EXECUTE acotado, igual que el resto de RPC (S-B): nada para public/anon.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'cancelar_reserva(uuid)',
    'cumplir_evento(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
