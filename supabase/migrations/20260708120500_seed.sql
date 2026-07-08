-- ============================================================================
-- S-A · SEED / datos de ejemplo  (MIGRACIÓN DE SEED — claramente marcada)
--
-- Se incluye como migración para que `supabase db push` la cargue en la BD
-- remota (seed.sql sólo corre en `db reset` local, y aquí no usamos Docker).
--
-- Idempotente: sólo siembra si aún no hay productos. Las categorías por defecto
-- se insertan siempre con ON CONFLICT DO NOTHING.
--
-- UUIDs fijos y legibles para poder referenciarlos desde tests / inspección.
-- ============================================================================

-- 6 categorías por defecto (DOMAIN §3.2). Colores deterministas.
insert into categoria (nombre, color) values
  ('Audio',        '#3B82F6'),
  ('Vídeo',        '#8B5CF6'),
  ('Iluminación',  '#F59E0B'),
  ('Estructuras',  '#10B981'),
  ('Consumibles',  '#EF4444'),
  ('Otros',        '#6B7280')
on conflict (nombre) do nothing;

do $$
declare
  v_cat_audio uuid;
  v_cat_video uuid;
  v_cat_ilum  uuid;
  v_cat_estr  uuid;
  v_cat_cons  uuid;
  v_cat_otros uuid;
begin
  if exists (select 1 from producto) then
    raise notice 'seed: ya hay productos, se omite la siembra de ejemplo';
    return;
  end if;

  select id into v_cat_audio from categoria where nombre = 'Audio';
  select id into v_cat_video from categoria where nombre = 'Vídeo';
  select id into v_cat_ilum  from categoria where nombre = 'Iluminación';
  select id into v_cat_estr  from categoria where nombre = 'Estructuras';
  select id into v_cat_cons  from categoria where nombre = 'Consumibles';
  select id into v_cat_otros from categoria where nombre = 'Otros';

  -- Perfiles (en S-B se ligan a auth.users). Admin principal protegido.
  insert into perfil (id, nombre, rol, activo, es_principal) values
    ('11111111-1111-1111-1111-111111111111', 'Admin Suricato', 'admin',      true, true),
    ('22222222-2222-2222-2222-222222222222', 'Trabajador Uno', 'trabajador', true, false);

  -- Clientes con jerarquía (parent_id).
  insert into cliente (id, nombre, contacto, email, parent_id) values
    ('c1111111-1111-1111-1111-111111111111', 'Productora Nacional', 'Ana Ruiz',  'ana@prodnacional.es',  null),
    ('c2222222-2222-2222-2222-222222222222', 'Delegación Norte',    'Iker Sanz', 'iker@prodnacional.es', 'c1111111-1111-1111-1111-111111111111'),
    ('c3333333-3333-3333-3333-333333333333', 'Ayuntamiento Sur',    'Lucía Gil', 'cultura@aytosur.es',   null);

  -- Eventos con fechas.
  insert into evento (id, nombre, cliente_id, fecha_inicio, fecha_fin, estado, creado_por) values
    ('e1111111-1111-1111-1111-111111111111', 'Festival de Verano', 'c1111111-1111-1111-1111-111111111111', '2026-07-15', '2026-07-20', 'en_curso',     '11111111-1111-1111-1111-111111111111'),
    ('e2222222-2222-2222-2222-222222222222', 'Boda Corporativa',   'c3333333-3333-3333-3333-333333333333', '2026-08-01', '2026-08-03', 'planificado',  '11111111-1111-1111-1111-111111111111');

  -- Productos: repartos variados; algunos bajo mínimo; algunos asignados a cliente.
  insert into producto (id, nombre, categoria_id, stock_minimo, ubicacion, disponible, en_evento, en_reparacion, cliente_id) values
    ('a0000001-0000-0000-0000-000000000001', 'Altavoz L-Acoustics X8',  v_cat_audio,  5, 'A-01', 12,  4, 1, null),
    ('a0000002-0000-0000-0000-000000000002', 'Micrófono Shure SM58',    v_cat_audio,  8, 'A-02',  3,  0, 0, null),                                            -- bajo mínimo
    ('a0000003-0000-0000-0000-000000000003', 'Cámara Sony FX6',         v_cat_video,  3, 'V-01',  6,  2, 0, 'c1111111-1111-1111-1111-111111111111'),          -- asignada
    ('a0000004-0000-0000-0000-000000000004', 'Proyector Barco 20k',     v_cat_video,  4, 'V-02',  2,  0, 2, null),                                            -- bajo mínimo
    ('a0000005-0000-0000-0000-000000000005', 'Foco LED PAR 64',         v_cat_ilum,  20, 'I-01', 40, 20, 0, null),
    ('a0000006-0000-0000-0000-000000000006', 'Cabeza móvil Robe',       v_cat_ilum,   6, 'I-02',  8,  0, 0, 'c3333333-3333-3333-3333-333333333333'),          -- asignada
    ('a0000007-0000-0000-0000-000000000007', 'Truss cuadra 3m',         v_cat_estr,  10, 'E-01', 30, 10, 0, null),
    ('a0000008-0000-0000-0000-000000000008', 'Tarima 2x1m',             v_cat_estr,   5, 'E-02', 15,  0, 0, null),
    ('a0000009-0000-0000-0000-000000000009', 'Cinta gaffer negra',      v_cat_cons,  10, 'C-01',  4,  0, 0, null),                                            -- bajo mínimo
    ('a0000010-0000-0000-0000-000000000010', 'Cable XLR 10m',           v_cat_otros, 10, 'O-01', 25,  0, 3, null);

  -- Reservas activas sobre el evento en curso (para v_producto_disponible /
  -- v_conflictos_reserva).
  insert into reserva (id, evento_id, producto_id, unidades, estado, creado_por) values
    ('e5000001-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000001', 5,  'activa', '22222222-2222-2222-2222-222222222222'),
    ('e5000002-0000-0000-0000-000000000002', 'e1111111-1111-1111-1111-111111111111', 'a0000005-0000-0000-0000-000000000005', 10, 'activa', '22222222-2222-2222-2222-222222222222');

  -- Movimientos históricos coherentes con los buckets:
  --  * una 'entrada' de alta,
  --  * las 'salida_evento' que explican el en_evento actual (ligadas al evento
  --    en curso), para que v_unidades_fuera_evento cuadre y devolver() funcione.
  insert into movimiento (tipo, producto_id, evento_id, usuario_id, unidades, bucket_origen, bucket_destino) values
    ('entrada',       'a0000001-0000-0000-0000-000000000001', null,                                    '11111111-1111-1111-1111-111111111111', 17, null,         'disponible'),
    ('salida_evento', 'a0000001-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',  4, 'disponible', 'en_evento'),
    ('salida_evento', 'a0000003-0000-0000-0000-000000000003', 'e1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',  2, 'disponible', 'en_evento'),
    ('salida_evento', 'a0000005-0000-0000-0000-000000000005', 'e1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 20, 'disponible', 'en_evento'),
    ('salida_evento', 'a0000007-0000-0000-0000-000000000007', 'e1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 10, 'disponible', 'en_evento');

  raise notice 'seed: datos de ejemplo cargados';
end $$;
