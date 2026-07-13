-- ============================================================================
-- S-F · `cliente.color` + paleta determinista.
--
-- Cada cliente tiene un color y **nunca queda sin él**: si el alta no lo indica,
-- un trigger BEFORE INSERT lo asigna de forma determinista a partir de su id.
-- El color se puede cambiar después desde la ficha (UPDATE normal bajo RLS).
--
-- Paleta deliberada (DOMAIN §3.4): tonos apagados/desaturados. NO compite con
--   * los buckets (verde/azul/ámbar/rojo saturados = estado de stock), ni
--   * los chips de categoría (#3B82F6, #8B5CF6, #F59E0B, #10B981, #EF4444…),
--   * ni con el índigo de marca (#5a4be0).
-- Se usan en las barras del calendario y en los chips de cliente, donde deben
-- identificar sin gritar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Paleta y elección determinista.
--    El índice sale del primer byte del md5 de la semilla (el id del cliente):
--    estable, reproducible y sin depender de funciones internas (hashtext).
-- ---------------------------------------------------------------------------
create or replace function wms_paleta_cliente()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    '#7E6B8F',  -- malva apagado
    '#5F8A8B',  -- verde azulado grisáceo
    '#A8776B',  -- terracota apagada
    '#6B7FA8',  -- azul pizarra
    '#8A8F5F',  -- oliva apagado
    '#9C6F8E',  -- ciruela apagada
    '#6F8F76',  -- salvia
    '#A8925F',  -- mostaza apagada
    '#7B7B8F',  -- gris azulado frío
    '#8F6B6B'   -- ladrillo apagado
  ];
$$;

create or replace function wms_color_cliente(p_semilla text)
returns text
language sql
immutable
set search_path = public
as $$
  select (wms_paleta_cliente())[
    (get_byte(decode(md5(coalesce(p_semilla, '')), 'hex'), 0) % 10) + 1
  ];
$$;

grant execute on function wms_paleta_cliente(), wms_color_cliente(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Columna `color` (idempotente). Sin DEFAULT: lo rellena el trigger a partir
--    del id de la fila, de modo que dos clientes distintos no colisionen siempre.
-- ---------------------------------------------------------------------------
alter table cliente add column if not exists color text;

create or replace function cliente_color_por_defecto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.color is null or length(btrim(new.color)) = 0 then
    new.color := wms_color_cliente(new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cliente_color on cliente;
create trigger trg_cliente_color
  before insert on cliente
  for each row execute function cliente_color_por_defecto();

-- Clientes que ya existían (seed): reciben su color determinista.
update cliente set color = wms_color_cliente(id::text)
where color is null or length(btrim(color)) = 0;

alter table cliente alter column color set not null;

comment on column cliente.color is
  'Color del cliente (chips y barras de calendario). Se asigna solo al crear (trigger, determinista por id) y se puede cambiar desde la ficha.';

-- ---------------------------------------------------------------------------
-- 3) Vista: movimientos asociados a un cliente (historial de su ficha).
--    "Asociado" = el movimiento lo dice explícitamente (movimiento.cliente_id),
--    o es de un evento de ese cliente, o de un producto asignado a ese cliente.
--    Ese orden es también el de precedencia del `cliente_id` resultante.
-- ---------------------------------------------------------------------------
create or replace view v_movimiento_cliente as
select
  m.id,
  coalesce(m.cliente_id, ev.cliente_id, pr.cliente_id) as cliente_id,
  m.tipo,
  m.producto_id,
  pr.nombre    as producto,
  pr.foto_path as producto_foto,
  m.evento_id,
  ev.nombre    as evento,
  m.usuario_id,
  pe.nombre    as usuario,
  m.unidades,
  m.bucket_origen,
  m.bucket_destino,
  m.valor_anterior,
  m.valor_nuevo,
  m.motivo,
  m.creado_en
from movimiento m
join producto pr on pr.id = m.producto_id
left join evento ev on ev.id = m.evento_id
left join perfil pe on pe.id = m.usuario_id
where coalesce(m.cliente_id, ev.cliente_id, pr.cliente_id) is not null;

grant select on v_movimiento_cliente to authenticated;
