-- ============================================================================
-- S-A · Vistas derivadas (solo lectura). docs/CONTRACTS.md §4.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- v_producto_disponible — producto + disponible_real (= disponible − reservas
-- activas). Incluye `total` derivado y bandera de stock bajo (sobre
-- disponible_real, DOMAIN §1).
-- ---------------------------------------------------------------------------
create or replace view v_producto_disponible as
select
  p.*,
  (p.disponible + p.en_evento + p.en_reparacion)            as total,
  coalesce(r.reservado, 0)                                  as reservado,
  (p.disponible - coalesce(r.reservado, 0))                as disponible_real,
  (p.disponible - coalesce(r.reservado, 0)) < p.stock_minimo as bajo_minimo
from producto p
left join (
  select producto_id, sum(unidades)::integer as reservado
  from reserva
  where estado = 'activa'
  group by producto_id
) r on r.producto_id = p.id;

-- ---------------------------------------------------------------------------
-- v_stock_por_categoria — suma de `total` por categoría (dashboard).
-- ---------------------------------------------------------------------------
create or replace view v_stock_por_categoria as
select
  c.id   as categoria_id,
  c.nombre as categoria,
  c.color,
  count(p.id)                                                     as n_productos,
  coalesce(sum(p.disponible), 0)                                  as disponible,
  coalesce(sum(p.en_evento), 0)                                   as en_evento,
  coalesce(sum(p.en_reparacion), 0)                              as en_reparacion,
  coalesce(sum(p.disponible + p.en_evento + p.en_reparacion), 0) as total
from categoria c
left join producto p on p.categoria_id = c.id
group by c.id, c.nombre, c.color;

-- ---------------------------------------------------------------------------
-- v_unidades_fuera_evento — unidades_fuera(producto, evento) (CONTRACTS §1.4).
-- Solo pares con saldo > 0 (material aún fuera en ese evento).
-- ---------------------------------------------------------------------------
create or replace view v_unidades_fuera_evento as
select
  m.producto_id,
  m.evento_id,
  sum(case m.tipo
        when 'salida_evento' then m.unidades
        when 'devolucion'    then -m.unidades
        else 0
      end)::integer as unidades_fuera
from movimiento m
where m.evento_id is not null
  and m.tipo in ('salida_evento', 'devolucion')
group by m.producto_id, m.evento_id
having sum(case m.tipo
             when 'salida_evento' then m.unidades
             when 'devolucion'    then -m.unidades
             else 0
           end) > 0;

-- ---------------------------------------------------------------------------
-- v_conflictos_reserva — eventos con rangos de fecha solapados que, entre dos
-- eventos, sobre-reservan el mismo producto (reservas activas suman más que el
-- `disponible` del producto). Detección por pares (evento_a < evento_b).
-- Solo eventos vivos (planificado | en_curso).
-- ---------------------------------------------------------------------------
create or replace view v_conflictos_reserva as
select
  ra.producto_id,
  pr.nombre                as producto,
  ea.id                    as evento_a,
  ea.nombre                as evento_a_nombre,
  eb.id                    as evento_b,
  eb.nombre                as evento_b_nombre,
  ra.unidades              as unidades_a,
  rb.unidades              as unidades_b,
  pr.disponible,
  (ra.unidades + rb.unidades) as reservado_solapado
from reserva ra
join reserva rb
  on rb.producto_id = ra.producto_id
 and rb.estado = 'activa'
 and rb.evento_id <> ra.evento_id
join evento ea on ea.id = ra.evento_id and ea.estado in ('planificado', 'en_curso')
join evento eb on eb.id = rb.evento_id and eb.estado in ('planificado', 'en_curso')
join producto pr on pr.id = ra.producto_id
where ra.estado = 'activa'
  and ea.id < eb.id                                   -- cada par una sola vez
  and ea.fecha_inicio <= eb.fecha_fin                 -- rangos solapados
  and eb.fecha_inicio <= ea.fecha_fin
  and (ra.unidades + rb.unidades) > pr.disponible;    -- sobre-reserva
