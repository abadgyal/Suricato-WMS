-- ============================================================================
-- S-B · Reescritura de las 8 RPC con identidad y permisos reales.
-- Fuente: docs/CONTRACTS.md §1.3/§2, prompt S-B.
--
-- Cambios respecto de S-A:
--   * Se elimina el parámetro p_usuario_id. El autor del movimiento es siempre
--     current_perfil_id() (= auth.uid()): el cliente NO elige el autor.
--   * Todas pasan a SECURITY DEFINER + search_path fijo, para poder escribir
--     buckets/movimiento y leer reservas saltándose RLS de forma controlada.
--   * ajustar y dar_de_baja exigen is_admin(); si no, WMS009 (CONTRACTS §1.3).
--   * Sin sesión (auth.uid() nulo) ⇒ WMS009.
--   * EXECUTE acotado: revocado a public/anon, concedido solo a authenticated.
--
-- Los helpers _wms_estado / _wms_reservas_activas / _wms_unidades_fuera siguen
-- válidos (definidos en la migración de RPC de S-A) y no se redefinen aquí.
-- ============================================================================

-- Se eliminan las firmas antiguas (llevaban p_usuario_id): al cambiar la firma
-- no basta CREATE OR REPLACE (crearía una sobrecarga ambigua).
drop function if exists registrar_entrada(integer, uuid, uuid, uuid, text, uuid, integer, text, text, jsonb);
drop function if exists crear_reserva(uuid, uuid, integer, uuid, text);
drop function if exists cumplir_reserva(uuid, uuid);
drop function if exists salida_evento(uuid, integer, uuid, uuid);
drop function if exists devolver(uuid, uuid, integer, integer, integer, uuid, text);
drop function if exists marcar_reparado(uuid, integer, uuid);
drop function if exists dar_de_baja(uuid, integer, text, uuid, text);
drop function if exists ajustar(uuid, text, integer, uuid, text);


-- ===========================================================================
-- 2.1 registrar_entrada — llegada de mercancía. disponible += n.
-- ===========================================================================
create or replace function registrar_entrada(
  p_unidades     integer,
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
security definer
set search_path = public
as $$
declare
  v_prod producto;
  v_cat  uuid;
  v_mov  uuid;
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;
  if p_unidades is null or p_unidades <= 0 then
    raise exception 'WMS002: cantidad inválida (unidades debe ser > 0)';
  end if;

  if p_producto_id is null then
    if p_nombre is null or length(btrim(p_nombre)) = 0 then
      raise exception 'WMS002: se requiere p_nombre para dar de alta un producto nuevo';
    end if;
    v_cat := p_categoria_id;
    if v_cat is null then
      select id into v_cat from categoria where nombre = 'Otros';
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
  values ('entrada', v_prod.id, p_cliente_id, v_uid, p_unidades, 'disponible')
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.2 crear_reserva — bloquea unidades de disponible para un evento.
-- ===========================================================================
create or replace function crear_reserva(
  p_evento_id   uuid,
  p_producto_id uuid,
  p_unidades    integer,
  p_notas       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod      producto;
  v_disp_real integer;
  v_reserva   reserva;
  v_uid       uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;
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
  values (p_evento_id, p_producto_id, p_unidades, 'activa', p_notas, v_uid)
  returning * into v_reserva;

  return to_jsonb(v_reserva);
end;
$$;


-- ===========================================================================
-- 2.3 cumplir_reserva — materializa una reserva: disponible → en_evento.
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

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.4 salida_evento — salida directa a un evento. disponible → en_evento.
-- ===========================================================================
create or replace function salida_evento(
  p_producto_id uuid,
  p_unidades    integer,
  p_evento_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod      producto;
  v_disp_real integer;
  v_mov       uuid;
  v_uid       uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;
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

  update producto
    set disponible = disponible - p_unidades,
        en_evento  = en_evento  + p_unidades,
        actualizado_en = now()
    where id = p_producto_id
    returning * into v_prod;

  insert into movimiento (tipo, producto_id, evento_id, usuario_id, unidades, bucket_origen, bucket_destino)
  values ('salida_evento', v_prod.id, p_evento_id, v_uid, p_unidades, 'disponible', 'en_evento')
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.5 devolver — check-in del material. Reparte OK/roto/perdido.
--     Retorno estándar + movimiento_ids[] (CONTRACTS §1.1/§2.5).
-- ===========================================================================
create or replace function devolver(
  p_evento_id   uuid,
  p_producto_id uuid,
  p_ok          integer,
  p_roto        integer,
  p_perdido     integer,
  p_motivo      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod  producto;
  v_total integer;
  v_fuera integer;
  v_movs  uuid[] := array[]::uuid[];
  v_mov   uuid;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;

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
    values ('devolucion', p_producto_id, p_evento_id, v_uid, p_ok, 'en_evento', 'disponible')
    returning id into v_mov;
    v_movs := v_movs || v_mov;
  end if;
  if p_roto > 0 then
    insert into movimiento (tipo, producto_id, evento_id, usuario_id, unidades, bucket_origen, bucket_destino)
    values ('devolucion', p_producto_id, p_evento_id, v_uid, p_roto, 'en_evento', 'en_reparacion')
    returning id into v_mov;
    v_movs := v_movs || v_mov;
  end if;
  if p_perdido > 0 then
    insert into movimiento (tipo, producto_id, evento_id, usuario_id, unidades, bucket_origen, bucket_destino, motivo)
    values ('devolucion', p_producto_id, p_evento_id, v_uid, p_perdido, 'en_evento', 'baja', p_motivo)
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
  p_unidades    integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod producto;
  v_mov  uuid;
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;
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
  values ('devolucion', p_producto_id, v_uid, p_unidades, 'en_reparacion', 'disponible')
  returning id into v_mov;

  return _wms_estado(v_prod, v_mov);
end;
$$;


-- ===========================================================================
-- 2.7 dar_de_baja — retira unidades del total (−total). Solo admin (WMS009).
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
  if not is_admin() then
    raise exception 'WMS009: dar_de_baja requiere rol admin';
  end if;
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
-- 2.8 ajustar — fija el valor de un bucket. Solo admin (WMS009).
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
  if not is_admin() then
    raise exception 'WMS009: ajustar requiere rol admin';
  end if;
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
-- Gestión de usuarios · desactivar_usuario — baja lógica (activo=false).
--   Solo admin (WMS009). No permite desactivar a un es_principal (invariante 8).
-- ===========================================================================
create or replace function desactivar_usuario(
  p_perfil_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfil;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'WMS009: operación requiere autenticación';
  end if;
  if not is_admin() then
    raise exception 'WMS009: desactivar_usuario requiere rol admin';
  end if;

  select * into v_perfil from perfil where id = p_perfil_id for update;
  if not found then
    raise exception 'WMS006: perfil inexistente (%)', p_perfil_id;
  end if;
  if v_perfil.es_principal then
    raise exception 'WMS_PRINCIPAL: el admin principal no puede desactivarse (invariante 8)';
  end if;

  update perfil set activo = false where id = p_perfil_id
  returning * into v_perfil;

  return jsonb_build_object(
    'perfil_id', v_perfil.id,
    'activo',    v_perfil.activo,
    'rol',       v_perfil.rol
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- EXECUTE acotado: revocar a public/anon, conceder solo a authenticated.
-- (Las RPC son SECURITY DEFINER; el control de rol lo hacen ellas mismas.)
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'registrar_entrada(integer, uuid, uuid, text, uuid, integer, text, text, jsonb)',
    'crear_reserva(uuid, uuid, integer, text)',
    'cumplir_reserva(uuid)',
    'salida_evento(uuid, integer, uuid)',
    'devolver(uuid, uuid, integer, integer, integer, text)',
    'marcar_reparado(uuid, integer)',
    'dar_de_baja(uuid, integer, text, text)',
    'ajustar(uuid, text, integer, text)',
    'desactivar_usuario(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
