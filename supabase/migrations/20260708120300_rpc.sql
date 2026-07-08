-- ============================================================================
-- S-A · Las 8 RPC de mutación de stock. docs/CONTRACTS.md §2.
--
-- Reglas transversales (aplican a todas):
--   * Cada RPC que muta stock bloquea la fila del producto con FOR UPDATE antes
--     de leer/escribir buckets (concurrencia; invariantes 1-4). DOMAIN §4.
--   * Errores con formato 'WMSNNN: mensaje' (CONTRACTS §1.2).
--   * Escriben SIEMPRE el/los registros en `movimiento` (append-only).
--   * `total` es derivado (disponible + en_evento + en_reparacion): jamás se
--     crea ni escribe una columna total.
--   * disponible_real = disponible − Σ(reservas activas del producto).
--   * Retorno estándar (CONTRACTS §1.1) salvo donde se indique otro.
--   * Rol/RLS se hace en S-B: aquí p_usuario_id es un parámetro y no se aplica
--     RLS ni WMS009.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper interno: retorno estándar de estado del producto + movimiento_id.
-- ---------------------------------------------------------------------------
create or replace function _wms_estado(p producto, p_movimiento_id uuid)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'producto_id',   p.id,
    'disponible',    p.disponible,
    'en_evento',     p.en_evento,
    'en_reparacion', p.en_reparacion,
    'total',         p.disponible + p.en_evento + p.en_reparacion,
    'movimiento_id', p_movimiento_id
  );
$$;

-- Helper interno: unidades activas reservadas de un producto (opcionalmente
-- excluyendo una reserva concreta, para cumplir_reserva).
create or replace function _wms_reservas_activas(p_producto_id uuid, p_excluir uuid default null)
returns integer
language sql
stable
as $$
  select coalesce(sum(unidades), 0)::integer
  from reserva
  where producto_id = p_producto_id
    and estado = 'activa'
    and (p_excluir is null or id <> p_excluir);
$$;

-- Helper interno: unidades fuera de un producto en un evento (CONTRACTS §1.4).
--   Σ salida_evento.unidades − Σ devolucion.unidades  (para ese prod+evento)
create or replace function _wms_unidades_fuera(p_producto_id uuid, p_evento_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(
    case tipo
      when 'salida_evento' then unidades
      when 'devolucion'    then -unidades
      else 0
    end), 0)::integer
  from movimiento
  where producto_id = p_producto_id
    and evento_id = p_evento_id
    and tipo in ('salida_evento', 'devolucion');
$$;


-- ===========================================================================
-- 2.1 registrar_entrada — llegada de mercancía. disponible += n.
--     Si p_producto_id es null, crea el producto (alta con metadatos).
-- ===========================================================================
create or replace function registrar_entrada(
  p_unidades     integer,
  p_usuario_id   uuid,
  p_producto_id  uuid    default null,
  p_cliente_id   uuid    default null,
  p_nombre       text    default null,
  p_categoria_id uuid    default null,
  p_stock_minimo integer default 5,
  p_ubicacion    text    default null,
  p_foto_path    text    default null,
  p_dimensiones  jsonb   default null
)
returns jsonb
language plpgsql
as $$
declare
  v_prod producto;
  v_cat  uuid;
  v_mov  uuid;
begin
  if p_unidades is null or p_unidades <= 0 then
    raise exception 'WMS002: cantidad inválida (unidades debe ser > 0)';
  end if;

  if p_producto_id is null then
    -- Alta de producto nuevo.
    if p_nombre is null or length(btrim(p_nombre)) = 0 then
      raise exception 'WMS002: se requiere p_nombre para dar de alta un producto nuevo';
    end if;
    v_cat := p_categoria_id;
    if v_cat is null then
      select id into v_cat from categoria where nombre = 'Otros';  -- categoría por defecto
      if v_cat is null then
        raise exception 'WMS006: no existe categoría por defecto "Otros"; indique p_categoria_id';
      end if;
    end if;

    insert into producto (
      nombre, categoria_id, foto_path, stock_minimo, ubicacion,
      disponible, cliente_id, largo_cm, ancho_cm, alto_cm, peso_kg
    ) values (
      p_nombre, v_cat, p_foto_path, coalesce(p_stock_minimo, 5), p_ubicacion,
      p_unidades, p_cliente_id,
      (p_dimensiones->>'largo')::numeric,
      (p_dimensiones->>'ancho')::numeric,
      (p_dimensiones->>'alto')::numeric,
      (p_dimensiones->>'peso')::numeric
    )
    returning * into v_prod;
  else
    -- Entrada sobre producto existente.
    select * into v_prod from producto where id = p_producto_id for update;
    if not found then
      raise exception 'WMS006: producto inexistente (%)', p_producto_id;
    end if;
    update producto
      set disponible = disponible + p_unidades,
          actualizado_en = now()
      where id = p_producto_id
      returning * into v_prod;
  end if;

  insert into movimiento (tipo, producto_id, cliente_id, usuario_id, unidades, bucket_destino)
  values ('entrada', v_prod.id, p_cliente_id, p_usuario_id, p_unidades, 'disponible')
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.2 crear_reserva — bloquea unidades de disponible para un evento.
--     No mueve buckets, no genera movimiento. Retorna la fila reserva.
-- ===========================================================================
create or replace function crear_reserva(
  p_evento_id   uuid,
  p_producto_id uuid,
  p_unidades    integer,
  p_usuario_id  uuid,
  p_notas       text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_prod  producto;
  v_disp_real integer;
  v_reserva reserva;
begin
  if p_unidades is null or p_unidades <= 0 then
    raise exception 'WMS002: cantidad inválida (unidades debe ser > 0)';
  end if;

  select * into v_prod from producto where id = p_producto_id for update;
  if not found then
    raise exception 'WMS006: producto inexistente (%)', p_producto_id;
  end if;

  v_disp_real := v_prod.disponible - _wms_reservas_activas(p_producto_id);
  if v_disp_real < p_unidades then
    raise exception 'WMS001: stock insuficiente (disponible_real % < % solicitadas)', v_disp_real, p_unidades;
  end if;

  insert into reserva (evento_id, producto_id, unidades, estado, notas, creado_por)
  values (p_evento_id, p_producto_id, p_unidades, 'activa', p_notas, p_usuario_id)
  returning * into v_reserva;

  return to_jsonb(v_reserva);
end;
$$;


-- ===========================================================================
-- 2.3 cumplir_reserva — materializa una reserva: disponible → en_evento.
-- ===========================================================================
create or replace function cumplir_reserva(
  p_reserva_id uuid,
  p_usuario_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_reserva reserva;
  v_prod producto;
  v_disp_real integer;
  v_mov uuid;
begin
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
  values ('salida_evento', v_prod.id, v_reserva.evento_id, p_usuario_id, v_reserva.unidades, 'disponible', 'en_evento')
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.4 salida_evento — salida directa a un evento. disponible → en_evento.
-- ===========================================================================
create or replace function salida_evento(
  p_producto_id uuid,
  p_unidades    integer,
  p_evento_id   uuid,
  p_usuario_id  uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_prod producto;
  v_disp_real integer;
  v_mov uuid;
begin
  if p_unidades is null or p_unidades <= 0 then
    raise exception 'WMS002: cantidad inválida (unidades debe ser > 0)';
  end if;

  select * into v_prod from producto where id = p_producto_id for update;
  if not found then
    raise exception 'WMS006: producto inexistente (%)', p_producto_id;
  end if;

  -- Salida directa: respeta TODAS las reservas activas.
  v_disp_real := v_prod.disponible - _wms_reservas_activas(p_producto_id);
  if v_disp_real < p_unidades then
    raise exception 'WMS001: stock insuficiente (disponible_real % < % solicitadas)', v_disp_real, p_unidades;
  end if;

  update producto
    set disponible = disponible - p_unidades,
        en_evento  = en_evento  + p_unidades,
        actualizado_en = now()
    where id = p_producto_id
    returning * into v_prod;

  insert into movimiento (tipo, producto_id, evento_id, usuario_id, unidades, bucket_origen, bucket_destino)
  values ('salida_evento', v_prod.id, p_evento_id, p_usuario_id, p_unidades, 'disponible', 'en_evento')
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.5 devolver — check-in del material del evento. Reparte OK/roto/perdido.
--     Genera uno o varios movimientos 'devolucion' (uno por destino > 0).
--     Retorno estándar + movimiento_ids[] (varios movimientos posibles).
-- ===========================================================================
create or replace function devolver(
  p_evento_id   uuid,
  p_producto_id uuid,
  p_ok          integer,
  p_roto        integer,
  p_perdido     integer,
  p_usuario_id  uuid,
  p_motivo      text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_prod producto;
  v_total  integer;
  v_fuera  integer;
  v_movs   uuid[] := array[]::uuid[];
  v_mov    uuid;
begin
  p_ok      := coalesce(p_ok, 0);
  p_roto    := coalesce(p_roto, 0);
  p_perdido := coalesce(p_perdido, 0);

  if p_ok < 0 or p_roto < 0 or p_perdido < 0 then
    raise exception 'WMS002: las cantidades de devolución no pueden ser negativas';
  end if;
  v_total := p_ok + p_roto + p_perdido;
  if v_total <= 0 then
    raise exception 'WMS002: la devolución debe repartir al menos una unidad';
  end if;
  if p_perdido > 0 and (p_motivo is null or length(btrim(p_motivo)) = 0) then
    raise exception 'WMS003: motivo obligatorio cuando hay unidades perdidas';
  end if;

  select * into v_prod from producto where id = p_producto_id for update;
  if not found then
    raise exception 'WMS006: producto inexistente (%)', p_producto_id;
  end if;

  v_fuera := _wms_unidades_fuera(p_producto_id, p_evento_id);
  if v_total > v_fuera then
    raise exception 'WMS005: devolución (%) excede las unidades fuera del producto en el evento (%)', v_total, v_fuera;
  end if;

  update producto
    set en_evento      = en_evento - v_total,
        disponible     = disponible + p_ok,
        en_reparacion  = en_reparacion + p_roto,
        baja_acumulada = baja_acumulada + p_perdido,
        actualizado_en = now()
    where id = p_producto_id
    returning * into v_prod;

  if p_ok > 0 then
    insert into movimiento (tipo, producto_id, evento_id, usuario_id, unidades, bucket_origen, bucket_destino)
    values ('devolucion', p_producto_id, p_evento_id, p_usuario_id, p_ok, 'en_evento', 'disponible')
    returning id into v_mov;
    v_movs := v_movs || v_mov;
  end if;
  if p_roto > 0 then
    insert into movimiento (tipo, producto_id, evento_id, usuario_id, unidades, bucket_origen, bucket_destino)
    values ('devolucion', p_producto_id, p_evento_id, p_usuario_id, p_roto, 'en_evento', 'en_reparacion')
    returning id into v_mov;
    v_movs := v_movs || v_mov;
  end if;
  if p_perdido > 0 then
    insert into movimiento (tipo, producto_id, evento_id, usuario_id, unidades, bucket_origen, bucket_destino, motivo)
    values ('devolucion', p_producto_id, p_evento_id, p_usuario_id, p_perdido, 'en_evento', 'baja', p_motivo)
    returning id into v_mov;
    v_movs := v_movs || v_mov;
  end if;

  return _wms_estado(v_prod, v_movs[1]) || jsonb_build_object('movimiento_ids', to_jsonb(v_movs));
end;
$$;


-- ===========================================================================
-- 2.6 marcar_reparado — en_reparacion → disponible.
-- ===========================================================================
create or replace function marcar_reparado(
  p_producto_id uuid,
  p_unidades    integer,
  p_usuario_id  uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_prod producto;
  v_mov uuid;
begin
  if p_unidades is null or p_unidades <= 0 then
    raise exception 'WMS002: cantidad inválida (unidades debe ser > 0)';
  end if;

  select * into v_prod from producto where id = p_producto_id for update;
  if not found then
    raise exception 'WMS006: producto inexistente (%)', p_producto_id;
  end if;
  if v_prod.en_reparacion < p_unidades then
    raise exception 'WMS007: en_reparacion (%) no tiene unidades suficientes para % ', v_prod.en_reparacion, p_unidades;
  end if;

  update producto
    set en_reparacion = en_reparacion - p_unidades,
        disponible    = disponible + p_unidades,
        actualizado_en = now()
    where id = p_producto_id
    returning * into v_prod;

  insert into movimiento (tipo, producto_id, usuario_id, unidades, bucket_origen, bucket_destino)
  values ('devolucion', p_producto_id, p_usuario_id, p_unidades, 'en_reparacion', 'disponible')
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.7 dar_de_baja — retira unidades del total de forma permanente (−total).
--     Rol admin (se aplicará en S-B; aquí sin WMS009).
-- ===========================================================================
create or replace function dar_de_baja(
  p_producto_id   uuid,
  p_unidades      integer,
  p_bucket_origen text,
  p_usuario_id    uuid,
  p_motivo        text
)
returns jsonb
language plpgsql
as $$
declare
  v_prod producto;
  v_actual integer;
  v_mov uuid;
begin
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
  values ('baja', p_producto_id, p_usuario_id, p_unidades, p_bucket_origen::bucket, 'baja', p_motivo)
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.8 ajustar — fija el valor de un bucket para cuadrar con el recuento físico.
--     Rol admin (se aplicará en S-B; aquí sin WMS009).
-- ===========================================================================
create or replace function ajustar(
  p_producto_id uuid,
  p_bucket      text,
  p_valor_nuevo integer,
  p_usuario_id  uuid,
  p_motivo      text
)
returns jsonb
language plpgsql
as $$
declare
  v_prod producto;
  v_anterior integer;
  v_mov uuid;
begin
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
  values ('ajuste', p_producto_id, p_usuario_id, p_bucket::bucket, v_anterior, p_valor_nuevo, p_motivo)
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;
