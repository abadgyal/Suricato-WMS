-- ============================================================================
-- S-A · Tablas del dominio + constraints (invariantes estructurales) + índices
-- Fuente de verdad: docs/DOMAIN.md §3/§4. docs/CONTRACTS.md.
--
-- Invariantes estructurales implementadas aquí como CHECK/constraints:
--   #2  ningún bucket negativo (producto).
--   #7  ajuste/baja requieren motivo no vacío (movimiento).
--   WMS008  evento.fecha_fin >= evento.fecha_inicio.
-- (La #1 total = suma de buckets es derivada: no hay columna total, luego se
--  cumple por construcción. Las #6 inmutabilidad y #8 admin principal van en
--  la migración de triggers.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 perfil  (perfil de aplicación del usuario)
-- En S-B se ligará a auth.users (mismo id) vía trigger. En S-A es una tabla
-- autónoma: las RPC reciben p_usuario_id y no aplican RLS todavía.
-- ---------------------------------------------------------------------------
create table perfil (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  rol          rol  not null default 'trabajador',
  activo       boolean not null default true,     -- soft-delete (invariante 8)
  es_principal boolean not null default false,    -- admin principal protegido
  creado_en    timestamptz not null default now()
);

-- Como mucho un admin principal.
create unique index ux_perfil_principal on perfil (es_principal) where es_principal;

-- ---------------------------------------------------------------------------
-- 3.2 categoria
-- ---------------------------------------------------------------------------
create table categoria (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  color  text not null default '#888888'
);

-- ---------------------------------------------------------------------------
-- 3.4 cliente  (jerarquía en árbol vía parent_id)
-- ---------------------------------------------------------------------------
create table cliente (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  contacto  text,
  email     text,
  telefono  text,
  parent_id uuid references cliente (id) on delete set null,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3.3 producto  (stock fungible por cantidad, repartido en buckets)
-- ---------------------------------------------------------------------------
create table producto (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  categoria_id   uuid not null references categoria (id) on delete restrict,
  foto_path      text,
  stock_minimo   integer not null default 5,
  ubicacion      text,
  -- Buckets (invariante 2: nunca negativos). El frontend NUNCA los escribe.
  disponible     integer not null default 0,
  en_evento      integer not null default 0,
  en_reparacion  integer not null default 0,
  baja_acumulada integer not null default 0,
  cliente_id     uuid references cliente (id) on delete set null,  -- asignación opcional (DOMAIN §6)
  largo_cm       numeric,
  ancho_cm       numeric,
  alto_cm        numeric,
  peso_kg        numeric,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Invariante 2.
  constraint producto_disponible_no_negativo     check (disponible     >= 0),
  constraint producto_en_evento_no_negativo      check (en_evento      >= 0),
  constraint producto_en_reparacion_no_negativo  check (en_reparacion  >= 0),
  constraint producto_baja_acumulada_no_negativa check (baja_acumulada >= 0),
  constraint producto_stock_minimo_no_negativo   check (stock_minimo   >= 0)
);

-- ---------------------------------------------------------------------------
-- 3.5 evento  (entidad de primera clase)
-- ---------------------------------------------------------------------------
create table evento (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  cliente_id   uuid references cliente (id) on delete set null,
  fecha_inicio date not null,
  fecha_fin    date not null,
  estado       estado_evento not null default 'planificado',
  notas        text,
  creado_por   uuid not null references perfil (id) on delete restrict,
  creado_en    timestamptz not null default now(),
  -- WMS008: rango de fechas válido.
  constraint evento_fechas_validas check (fecha_fin >= fecha_inicio)
);

-- ---------------------------------------------------------------------------
-- 3.6 reserva  (capa lógica sobre 'disponible'; no mueve buckets)
-- ---------------------------------------------------------------------------
create table reserva (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null references evento (id) on delete cascade,
  producto_id uuid not null references producto (id) on delete restrict,
  unidades    integer not null,
  estado      estado_reserva not null default 'activa',
  notas       text,
  creado_por  uuid not null references perfil (id) on delete restrict,
  creado_en   timestamptz not null default now(),
  constraint reserva_unidades_positivas check (unidades > 0)
);

-- ---------------------------------------------------------------------------
-- 3.7 movimiento  (log inmutable, append-only)
-- bucket_origen: siempre un bucket real  -> enum `bucket`.
-- bucket_destino: puede ser 'baja' (devolución por pérdida / baja) además de
--   los tres buckets -> text con CHECK. (DOMAIN §3.7/§5: la devolución se
--   materializa por su bucket_destino, que incluye 'baja'.)
-- ---------------------------------------------------------------------------
create table movimiento (
  id             uuid primary key default gen_random_uuid(),
  tipo           tipo_movimiento not null,
  producto_id    uuid not null references producto (id) on delete restrict,
  evento_id      uuid references evento (id) on delete restrict,
  cliente_id     uuid references cliente (id) on delete set null,
  usuario_id     uuid not null references perfil (id) on delete restrict,
  unidades       integer,
  bucket_origen  bucket,
  bucket_destino text,
  valor_anterior integer,
  valor_nuevo    integer,
  motivo         text,
  creado_en      timestamptz not null default now(),
  constraint movimiento_bucket_destino_valido
    check (bucket_destino is null
           or bucket_destino in ('disponible', 'en_evento', 'en_reparacion', 'baja')),
  -- Invariante 7: ajuste y baja exigen motivo no vacío.
  constraint movimiento_motivo_obligatorio
    check (tipo not in ('ajuste', 'baja')
           or (motivo is not null and length(btrim(motivo)) > 0))
);

-- ---------------------------------------------------------------------------
-- Índices en FKs y en lo que consultan RPC y vistas.
-- ---------------------------------------------------------------------------
create index ix_producto_categoria       on producto  (categoria_id);
create index ix_producto_cliente         on producto  (cliente_id);
create index ix_cliente_parent           on cliente   (parent_id);
create index ix_evento_cliente           on evento    (cliente_id);
create index ix_evento_creado_por        on evento    (creado_por);
create index ix_evento_fechas            on evento    (fecha_inicio, fecha_fin);
-- disponible_real: suma de reservas activas por producto.
create index ix_reserva_producto_estado  on reserva   (producto_id, estado);
create index ix_reserva_evento           on reserva   (evento_id);
create index ix_reserva_creado_por       on reserva   (creado_por);
-- unidades_fuera(producto, evento) y ficha de producto.
create index ix_movimiento_producto      on movimiento (producto_id);
create index ix_movimiento_prod_evento   on movimiento (producto_id, evento_id);
create index ix_movimiento_evento        on movimiento (evento_id);
create index ix_movimiento_usuario       on movimiento (usuario_id);
create index ix_movimiento_cliente       on movimiento (cliente_id);
create index ix_movimiento_tipo          on movimiento (tipo);
