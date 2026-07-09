# BOOTSTRAP.md — Primer admin del sistema

La Edge Function `crear-usuario` (alta de usuarios, Opción A) **exige un admin que
autorice**. El primer admin no puede crearse por ese camino: se crea una sola vez,
a mano, siguiendo estos pasos. A partir de ahí, todas las altas van por la función.

> Contexto de diseño: `perfil.id` es FK de `auth.users(id)`. El usuario de Auth se
> crea primero (en el Dashboard) y luego se le añade su fila en `perfil` con
> `rol = admin`, `es_principal = true`, `activo = true`. Solo puede existir **un**
> `es_principal` a la vez (índice único parcial `ux_perfil_principal`).

---

## Paso 1 — Crear el usuario en Auth (lo haces tú, en el Dashboard)

1. Supabase Dashboard → **Authentication → Users → Add user**.
2. Introduce **email** y **contraseña** del admin principal. Marca el email como
   confirmado (*Auto Confirm User*) para poder iniciar sesión sin correo.
3. Copia el **UID** del usuario recién creado (columna *UID* / detalle del usuario).
   Es un UUID como `a1b2c3d4-....`.

Pásame ese UID (o ejecútalo tú mismo en el paso 2).

---

## Paso 2 — Crear su fila en `perfil` (SQL)

Ejecuta este SQL en el **SQL Editor** del Dashboard (o con `psql`/`db`), sustituyendo
los dos huecos. Va dentro de una transacción y **transfiere** la condición de
principal: si ya existía un `es_principal` (p. ej. el admin de ejemplo del seed,
`admin.demo@suricato.local`), lo degrada antes de promover al real, evitando chocar
con el índice único.

```sql
begin;

-- 1) Libera cualquier principal previo (el demo del seed, si existe).
update perfil set es_principal = false where es_principal;

-- 2) Alta / promoción del admin principal real.
--    <<UID>>    → UID copiado del Dashboard (Paso 1).
--    <<NOMBRE>> → nombre visible del admin.
insert into perfil (id, nombre, rol, activo, es_principal)
values ('<<UID>>', '<<NOMBRE>>', 'admin', true, true)
on conflict (id) do update
  set rol = 'admin', activo = true, es_principal = true, nombre = excluded.nombre;

commit;
```

Ejemplo ya rellenado:

```sql
begin;
update perfil set es_principal = false where es_principal;
insert into perfil (id, nombre, rol, activo, es_principal)
values ('a1b2c3d4-1111-2222-3333-444455556666', 'Nacho (admin)', 'admin', true, true)
on conflict (id) do update
  set rol = 'admin', activo = true, es_principal = true, nombre = excluded.nombre;
commit;
```

---

## Paso 3 — Verificar

```sql
select id, nombre, rol, activo, es_principal from perfil where es_principal;
-- Debe devolver exactamente una fila: tu admin principal, rol=admin, activo=true.
```

Inicia sesión en la app con ese email/contraseña. Desde ese admin ya puedes dar de
alta al resto de usuarios con la Edge Function `crear-usuario` (nunca vuelvas a tocar
`perfil` a mano para altas normales).

---

## Notas

- **Perfiles de ejemplo del seed.** El seed de S-A creó `admin.demo@suricato.local`
  (era el principal en dev) y `trabajador.demo@suricato.local`, ligados a usuarios de
  Auth **sin contraseña** (no inician sesión; solo sostienen el histórico de ejemplo).
  El SQL de arriba degrada al demo y deja tu admin real como único principal. Si
  quieres una base limpia sin datos de ejemplo, elimina primero los productos,
  movimientos, reservas, eventos y perfiles demo (recuerda: `movimiento` es
  append-only por trigger; su borrado exige `service_role`/`postgres`).
- **El principal está protegido.** No se puede borrar (`WMS_PRINCIPAL`) ni desactivar
  (`desactivar_usuario` lo rechaza). Para cambiar quién es principal, repite el
  patrón «degradar el actual → promover el nuevo» en una transacción.
- **Secretos.** Este procedimiento no usa la `service_role`. La contraseña se fija en
  el Dashboard; el SQL solo escribe metadatos de negocio en `perfil`.
