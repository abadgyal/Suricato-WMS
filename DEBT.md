# DEBT.md — Registro de deuda técnica

Todo lo que se pospone o se deja a medias se anota aquí. **Nada de deuda silenciosa.**

Cada entrada: qué se pospuso, por qué, y el sprint o condición en que se retoma.

## Formato

```
### [S-X] Título breve
- **Qué:** descripción del atajo o de lo que falta.
- **Por qué:** motivo de posponerlo.
- **Cuándo se resuelve:** sprint / condición.
- **Fecha:** AAAA-MM-DD.
```

---

### [S-A→S-B] RLS, roles y WMS009 no aplicados en las RPC
- **Qué:** las 8 RPC reciben `p_usuario_id` como parámetro y NO comprueban rol ni
  aplican RLS. `dar_de_baja`/`ajustar` no lanzan `WMS009` todavía. Las funciones se
  crearon con `SECURITY INVOKER` (por defecto) y sin `GRANT` a `anon`/`authenticated`.
- **Por qué:** identidad y permisos son el objetivo de S-B; S-A se centra en la
  lógica transaccional y las invariantes, validadas en aislado.
- **Cuándo se resuelve:** S-B (Auth + RLS): trigger `perfil` ↔ `auth.users`,
  políticas por rol, `SECURITY DEFINER` + `GRANT` donde toque, y `WMS009`.
- **Fecha:** 2026-07-08.
- **Estado:** ✅ RESUELTA en S-B (2026-07-09). Las 8 RPC pasan a `SECURITY DEFINER`,
  usan `current_perfil_id()` (= `auth.uid()`) como autor en vez de `p_usuario_id`,
  `ajustar`/`dar_de_baja` exigen `is_admin()` (WMS009), y hay RLS por rol en todas
  las tablas con `EXECUTE`/`GRANT` acotados.

### [S-A] `perfil` aún no cuelga de `auth.users`
- **Qué:** `perfil.id` es un `uuid` autónomo con `default gen_random_uuid()`, no una
  FK a `auth.users(id)`.
- **Por qué:** `auth.users` y el flujo de alta (Edge Function) llegan en S-B.
- **Cuándo se resuelve:** S-B.
- **Fecha:** 2026-07-08.
- **Estado:** ✅ RESUELTA en S-B (2026-07-09). `perfil.id` es ahora FK a
  `auth.users(id) ON DELETE CASCADE` (se quita el `default`). Los perfiles de ejemplo
  del seed se ligan a usuarios de `auth` de prueba (sin contraseña) creados en la
  migración puente. Alta real por Edge Function `crear-usuario`.

### [S-A] `devolver` devuelve un retorno ampliado
- **Qué:** al poder generar varios movimientos (OK/roto/perdido), `devolver` añade al
  retorno estándar un campo `movimiento_ids` (array) además de `movimiento_id` (el
  primero). El resto de RPC siguen el retorno estándar de CONTRACTS §1.1 tal cual.
- **Por qué:** CONTRACTS §1.1 asume un único `movimiento_id`; la devolución por líneas
  necesita exponer todos.
- **Cuándo se resuelve:** confirmar el contrato con Persona B en S-D/S-E.
- **Fecha:** 2026-07-08.
- **Estado:** ✅ RESUELTA (documentada) en S-B (2026-07-09). CONTRACTS §1.1 y §2.5
  recogen ya el retorno con `movimiento_ids[]`. Queda por confirmar el consumo en el
  front (Persona B, S-D/S-E).

### [S-A] Ficheros con secretos en la carpeta del repo (sin versionar)
- **Qué:** `.env.local.txt` y `Contraseñas y cosas.txt` (raíz) contienen la
  contraseña de la BD y **la `service_role` `sb_secret_...`**. Se han añadido al
  `.gitignore` (verificado con `git check-ignore`), pero siguen en disco.
- **Por qué:** los dejó el humano en S-0; no deben vivir en la carpeta del repo.
- **Cuándo se resuelve:** el humano debería moverlos fuera del repo y **rotar la
  `service_role`** si hubo riesgo de exposición. Ver resumen de la sesión.
- **Fecha:** 2026-07-08.

### [S-A] Nota de diseño: `movimiento.bucket_destino` es `text`, no enum
- **Qué:** `bucket_origen` usa el enum `bucket` (3 valores), pero `bucket_destino` es
  `text` con CHECK para admitir además `'baja'` (devolución por pérdida / baja).
- **Por qué:** el enum `bucket` se definió con exactamente 3 valores (S-A); `'baja'`
  no es un bucket operativo pero sí un destino de movimiento (DOMAIN §3.7/§5).
- **Cuándo se resuelve:** decisión estable; documentada por si se revisa el enum.
- **Fecha:** 2026-07-08.

### [S-B] "Persona que registra" NO es editable: es siempre el usuario autenticado
- **Qué:** el manual/SPEC §4 pedía un campo "usuario que registra" precargado pero
  **editable**. En S-B las RPC ya no aceptan `p_usuario_id`: el autor del movimiento
  es siempre `current_perfil_id()` (= `auth.uid()`), no un id arbitrario del cliente.
- **Por qué:** la traza de auditoría debe reflejar quién ejecutó de verdad la acción;
  permitir elegir autor rompería la auditoría y el modelo de permisos.
- **Cuándo se resuelve:** decisión estable. Si el negocio necesita registrar "a nombre
  de otro", se añadiría un campo aparte (p. ej. `movimiento.registrado_para`) sin tocar
  `usuario_id`. El front debe dejar de mostrar el autor como editable.
- **Fecha:** 2026-07-09.

### [S-B] `perfil` no tiene columna `username`; la Edge Function lo guarda en metadata
- **Qué:** `crear-usuario` recibe `username`, pero `perfil` (DOMAIN §3.1) no tiene esa
  columna. Se guarda en `auth.users.raw_user_meta_data.username`. El login es por email.
- **Por qué:** DOMAIN es la fuente de verdad y no define `username` en `perfil`; no se
  añade una columna sin necesidad de producto.
- **Cuándo se resuelve:** si el producto exige `username` propio (búsqueda, mención),
  se añade `perfil.username` en un sprint de admin (S-F).
- **Fecha:** 2026-07-09.

### [S-B] Sin RPC `cancelar_reserva`; reservas sin escritura directa bajo RLS
- **Qué:** las reservas solo se crean/cumplen por RPC. Cancelar una reserva (`estado =
  'cancelada'`, SPEC §8) no tiene RPC y RLS no permite `UPDATE` directo sobre `reserva`.
- **Por qué:** S-B cierra permisos; el flujo de cancelación es del ciclo de alquiler.
- **Cuándo se resuelve:** S-E (Reservas/Eventos/Devolución): RPC `cancelar_reserva`.
- **Fecha:** 2026-07-09.
