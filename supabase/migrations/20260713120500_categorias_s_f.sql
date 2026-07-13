-- ============================================================================
-- S-F · Categorías: gestión abierta, color determinista y borrado seguro.
--
-- 1) Color determinista por nombre (paleta viva, la del seed). Se asigna al
--    crear la categoría si no se indica: así el alta **en línea** desde el
--    formulario de Entrada (deuda [S-D]) no tiene que inventarse un color.
--
-- 2) Borrado: hasta ahora `producto.categoria_id` era NOT NULL con
--    ON DELETE RESTRICT, así que una categoría en uso simplemente no se podía
--    borrar. Decisión de S-F: **al eliminar una categoría, sus productos quedan
--    sin categoría; no se borra ningún producto ni se toca el histórico** (los
--    movimientos no referencian la categoría). Se modela con
--    `categoria_id` NULL-able + ON DELETE SET NULL.
--
-- 3) Permisos: crear/editar YA estaban abiertos a cualquier autenticado (S-D).
--    S-F abre también el DELETE (era solo-admin): la gestión de categorías es
--    del día a día del almacén. Ver CONTRACTS §1.3.
--
-- 4) `v_stock_por_categoria` gana una fila "Sin categoría" para que el desglose
--    del dashboard siga sumando el total del almacén.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Paleta y color determinista de categoría.
-- ---------------------------------------------------------------------------
create or replace function wms_paleta_categoria()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    '#3B82F6',  -- azul
    '#8B5CF6',  -- violeta
    '#F59E0B',  -- ámbar
    '#10B981',  -- esmeralda
    '#EF4444',  -- rojo
    '#6B7280',  -- gris
    '#EC4899',  -- rosa
    '#14B8A6',  -- turquesa
    '#F97316',  -- naranja
    '#84CC16'   -- lima
  ];
$$;

create or replace function wms_color_categoria(p_nombre text)
returns text
language sql
immutable
set search_path = public
as $$
  select (wms_paleta_categoria())[
    (get_byte(decode(md5(lower(btrim(coalesce(p_nombre, '')))), 'hex'), 0) % 10) + 1
  ];
$$;

grant execute on function wms_paleta_categoria(), wms_color_categoria(text) to authenticated;

-- El DEFAULT '#888888' impedía distinguir "no me han dado color" de "me han
-- dado gris": se retira y lo rellena el trigger.
alter table categoria alter column color drop default;

create or replace function categoria_color_por_defecto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.color is null or length(btrim(new.color)) = 0 then
    new.color := wms_color_categoria(new.nombre);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_categoria_color on categoria;
create trigger trg_categoria_color
  before insert on categoria
  for each row execute function categoria_color_por_defecto();

-- ---------------------------------------------------------------------------
-- 2) Borrado de categoría ⇒ sus productos quedan sin categoría.
-- ---------------------------------------------------------------------------
alter table producto alter column categoria_id drop not null;

alter table producto drop constraint if exists producto_categoria_id_fkey;
alter table producto
  add constraint producto_categoria_id_fkey
  foreign key (categoria_id) references categoria (id) on delete set null;

comment on column producto.categoria_id is
  'Categoría del producto. NULL = sin categoría (p. ej. tras borrar la suya: DOMAIN §3.2/§3.3).';

-- ---------------------------------------------------------------------------
-- 3) DELETE de categoría abierto a cualquier autenticado (antes solo admin).
-- ---------------------------------------------------------------------------
drop policy if exists categoria_delete on categoria;
create policy categoria_delete on categoria
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 4) `registrar_entrada`: si no se indica categoría, el producto se crea SIN
--    categoría. Antes caía en la categoría 'Otros' y fallaba (WMS006) si
--    alguien la borraba; ahora `categoria_id` admite NULL y no hay tal
--    dependencia. El resto del cuerpo es el de 20260709120100_rpc_auth.sql.
-- ---------------------------------------------------------------------------
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
    if p_categoria_id is not null
       and not exists (select 1 from categoria where id = p_categoria_id) then
      raise exception 'WMS006: categoría inexistente (%)', p_categoria_id;
    end if;

    insert into producto (
      nombre, categoria_id, foto_path, stock_minimo, ubicacion,
      disponible, cliente_id, largo_cm, ancho_cm, alto_cm, peso_kg
    ) values (
      p_nombre, p_categoria_id, p_foto_path, coalesce(p_stock_minimo, 5), p_ubicacion,
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

-- ---------------------------------------------------------------------------
-- 5) `v_stock_por_categoria` + fila "Sin categoría": si un producto se queda
--    huérfano de categoría, el desglose del dashboard debe seguir cuadrando
--    con el total del almacén.
-- ---------------------------------------------------------------------------
create or replace view v_stock_por_categoria as
select
  c.id     as categoria_id,
  c.nombre as categoria,
  c.color,
  count(p.id)                                                    as n_productos,
  coalesce(sum(p.disponible), 0)                                 as disponible,
  coalesce(sum(p.en_evento), 0)                                  as en_evento,
  coalesce(sum(p.en_reparacion), 0)                              as en_reparacion,
  coalesce(sum(p.disponible + p.en_evento + p.en_reparacion), 0) as total
from categoria c
left join producto p on p.categoria_id = c.id
group by c.id, c.nombre, c.color

union all

select
  null::uuid            as categoria_id,
  'Sin categoría'::text as categoria,
  '#9CA3AF'::text       as color,
  count(*)                                                       as n_productos,
  coalesce(sum(p.disponible), 0)                                 as disponible,
  coalesce(sum(p.en_evento), 0)                                  as en_evento,
  coalesce(sum(p.en_reparacion), 0)                              as en_reparacion,
  coalesce(sum(p.disponible + p.en_evento + p.en_reparacion), 0) as total
from producto p
where p.categoria_id is null
having count(*) > 0;
