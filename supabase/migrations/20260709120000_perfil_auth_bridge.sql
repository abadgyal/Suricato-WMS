-- ============================================================================
-- S-B · Puente perfil ↔ auth.users + helpers de identidad/rol.
-- Fuente: docs/DOMAIN.md §3.1, docs/CONTRACTS.md §1.3, prompt S-B.
--
-- Resuelve la deuda [S-A] "perfil aún no cuelga de auth.users":
--   * perfil.id pasa a ser FK de auth.users(id) ON DELETE CASCADE.
--   * El seed de S-A creó perfiles de ejemplo (11111111…, 22222222…) con ids
--     ficticios, referenciados por movimientos históricos. Para no violar la FK
--     se ligan esos perfiles a **usuarios de auth de prueba** (opción b del
--     prompt): se crean sus filas en auth.users (sin contraseña: no inician
--     sesión; existen solo para sostener el histórico de ejemplo). El primer
--     admin real se crea aparte (ver docs/BOOTSTRAP.md).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Backing auth.users para los perfiles de ejemplo del seed.
--    Sin encrypted_password ⇒ no se puede iniciar sesión con contraseña; son
--    cuentas de soporte del histórico de demostración. Idempotente.
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin.demo@suricato.local', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"nombre":"Admin Suricato","demo":true}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'trabajador.demo@suricato.local', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"nombre":"Trabajador Uno","demo":true}'::jsonb, now(), now())
on conflict (id) do nothing;

-- Red de seguridad: cualquier otro perfil sin respaldo en auth.users (p. ej.
-- residuos de pruebas) recibe una fila mínima antes de crear la FK.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select p.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       format('perfil+%s@wms.local', p.id), now(), now()
from perfil p
where not exists (select 1 from auth.users u where u.id = p.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) perfil.id ⇒ FK a auth.users(id) ON DELETE CASCADE.
--    Se quita el default gen_random_uuid(): el id siempre proviene de auth.users
--    (Edge Function crear-usuario / bootstrap). La baja de un usuario es lógica
--    (activo=false); borrar el auth.user cascada al perfil, pero los movimientos
--    lo referencian con ON DELETE RESTRICT (se preserva la auditoría).
-- ---------------------------------------------------------------------------
alter table perfil alter column id drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'perfil_id_fkey' and conrelid = 'perfil'::regclass
  ) then
    alter table perfil
      add constraint perfil_id_fkey
      foreign key (id) references auth.users (id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Helpers de identidad y rol. Se usan en políticas RLS y en las RPC.
--    SECURITY DEFINER + search_path fijo: leen `perfil` saltándose RLS (evita
--    recursión en las políticas de perfil) y devuelven el rol real del llamante.
-- ---------------------------------------------------------------------------

-- Perfil del llamante autenticado (= auth.uid()). NULL si no hay sesión.
create or replace function current_perfil_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;

-- Rol del perfil del llamante. NULL si no hay perfil (no autenticado).
create or replace function current_rol()
returns rol
language sql
stable
security definer
set search_path = public
as $$
  select p.rol from perfil p where p.id = auth.uid();
$$;

-- ¿El llamante es un admin activo?
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfil p
    where p.id = auth.uid() and p.rol = 'admin' and p.activo
  );
$$;

grant execute on function current_perfil_id(), current_rol(), is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Autoría por defecto en las tablas de CRUD directo (evento, reserva):
--    creado_por = auth.uid() salvo que la RPC/servicio lo fije explícitamente.
--    Refuerza que el autor sea el usuario autenticado real.
-- ---------------------------------------------------------------------------
alter table evento  alter column creado_por set default auth.uid();
alter table reserva alter column creado_por set default auth.uid();
