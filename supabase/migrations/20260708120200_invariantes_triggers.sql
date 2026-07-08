-- ============================================================================
-- S-A · Invariantes que necesitan trigger (no expresables como CHECK)
--   #6  movimiento es inmutable: sin UPDATE ni DELETE. Una corrección es un
--       ajuste nuevo. DOMAIN §4.6.
--   #8  el perfil con es_principal = true no puede eliminarse; los usuarios se
--       dan de baja lógica (activo = false). DOMAIN §4.8.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- #6  Inmutabilidad del log de movimientos.
-- ---------------------------------------------------------------------------
create or replace function trg_movimiento_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'WMS_INMUTABLE: los movimientos son inmutables (append-only); una corrección es un ajuste nuevo'
    using errcode = 'restrict_violation';
  return null;
end;
$$;

create trigger trg_movimiento_no_update
  before update on movimiento
  for each row execute function trg_movimiento_inmutable();

create trigger trg_movimiento_no_delete
  before delete on movimiento
  for each row execute function trg_movimiento_inmutable();

-- ---------------------------------------------------------------------------
-- #8  El admin principal no se elimina.
-- ---------------------------------------------------------------------------
create or replace function trg_perfil_principal_protegido()
returns trigger
language plpgsql
as $$
begin
  if old.es_principal then
    raise exception
      'WMS_PRINCIPAL: el admin principal no puede eliminarse (dá de baja lógica con activo = false)'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger trg_perfil_no_delete_principal
  before delete on perfil
  for each row execute function trg_perfil_principal_protegido();
