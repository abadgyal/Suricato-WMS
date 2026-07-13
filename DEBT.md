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
- **Estado:** ✅ RESUELTA en S-A (2026-07-09)

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

### [S-C] Realtime revalida el inventario completo ante cualquier cambio
- **Qué:** `useInventario` se suscribe a `postgres_changes` de la tabla `producto` y,
  ante cualquier INSERT/UPDATE/DELETE, vuelve a leer la vista entera (con debounce de
  250 ms). No aplica el cambio fila a fila.
- **Por qué:** las vistas no emiten Realtime (hay que escuchar la tabla base y
  revalidar) y el re-fetch total es simple y correcto para el volumen actual.
- **Cuándo se resuelve:** si el catálogo crece a miles de referencias, aplicar el
  cambio por fila usando el `payload` del evento en vez de re-leer todo.
- **Fecha:** 2026-07-09.

### [S-C] Fuentes (Space Grotesk + Inter) cargadas por CDN de Google Fonts
- **Qué:** `styles/tokens.css` importa las fuentes con `@import url(fonts.googleapis…)`.
  Depende de red externa y no funciona offline.
- **Por qué:** rápido y suficiente en desarrollo; evita meter binarios de fuente en el
  repo antes de tiempo.
- **Cuándo se resuelve:** S-G (deploy): auto-hospedar las fuentes (woff2 + `@font-face`)
  para rendimiento y privacidad, sin llamada a terceros.
- **Fecha:** 2026-07-09.

### [S-C] Fotos de producto: se asume bucket de Storage `productos` público
- **Qué:** `lib/format.ts` genera la URL de foto con `storage.from('productos')
  .getPublicUrl(foto_path)`. El seed no trae fotos (`foto_path` nulo), así que el camino
  con imagen real no se ha probado; si el bucket no existe o no es público, la miniatura
  caería al marcador.
- **Por qué:** la subida de fotos es de la entrada de mercancía (S-D); en S-C solo se
  consume el `foto_path` existente.
- **Cuándo se resuelve:** S-D (Entrada de stock): crear el bucket `productos` (público,
  límite 5 MB, JPG/PNG/WebP) y su política, y validar el flujo de foto de punta a punta.
- **Fecha:** 2026-07-09.
- **Estado:** ✅ RESUELTA en S-D (2026-07-09). Migración
  `20260709120500_storage_productos.sql`: bucket `productos` público, límite 5 MiB,
  `allowed_mime_types` JPG/PNG/WebP, políticas de subida (autenticado) y lectura
  pública. El formulario de entrada sube la foto y valida tipo/tamaño en cliente.

### [S-C] Realtime revalida el inventario completo → canal privado autenticado
- **Estado:** ✅ RESUELTA (parte de autenticación) en S-D (2026-07-09). La deuda
  original ("revalida el inventario completo ante cualquier cambio", más abajo)
  sigue vigente como optimización; lo que S-D corrige es que el canal **no recibía
  cambios** porque la tabla `producto` tiene RLS y el canal iba sin autenticar. Ahora
  `useInventario` fija el token de la sesión con `supabase.realtime.setAuth(token)` y
  se re-suscribe si la sesión cambia. La activación de Realtime queda en migración
  reproducible (`20260709120400_realtime_s_d.sql`: `producto` y `movimiento` en la
  publicación `supabase_realtime` + `replica identity full`).

### [S-D] Reajuste de permisos: `ajustar`/`dar_de_baja` y categorías abiertas
- **Qué:** S-B había dejado `ajustar` y `dar_de_baja` como solo-admin (WMS009 por
  rol) y la escritura de `categoria` como solo-admin. S-D lo relaja: ambas RPC y el
  CRUD de categorías (crear/editar) quedan abiertos a cualquier autenticado. Borrar
  categoría sigue siendo solo-admin; la gestión de usuarios (crear-usuario /
  `desactivar_usuario`) también.
- **Por qué:** decisión de producto (el día a día del almacén lo llevan trabajadores;
  reservar ajuste/baja a admin entorpecía la operativa). Documentado en CONTRACTS §1.3.
- **Cuándo se resuelve:** hecho en S-D. Migración `20260709120300_permisos_s_d.sql`;
  tests de `db-test.mjs` actualizados (trabajador SÍ ajusta/da de baja/crea categoría).
- **Fecha:** 2026-07-09.

### [S-D] Alta de categoría en línea desde el formulario de Entrada
- **Qué:** el formulario de Entrada selecciona una categoría existente pero **no**
  permite crear una nueva en línea (SPEC §4 lo menciona: "se puede crear nueva").
  La escritura de categorías ya está abierta a cualquier autenticado (S-D), así que
  falta solo la UI.
- **Por qué:** `categoria.color` debe ser determinista y estable (DOMAIN §3.2) y la
  paleta actual es la del seed (Audio, Vídeo…); crear categorías con color arbitrario
  desde la entrada se salía del foco del bloque de formularios.
- **Cuándo se resuelve:** S-F (gestión de categorías del admin) o antes si se define
  un generador de color determinista por nombre. La gestión de categorías es de S-F.
- **Fecha:** 2026-07-13.

### [S-D] Historial limitado a los últimos 500 movimientos (sin paginación)
- **Qué:** `useMovimientos` lee `.limit(500)` ordenado por fecha desc. Con más de 500
  movimientos, los más antiguos no aparecen en el historial (el dashboard usa un
  `count` real aparte, así que "movimientos hoy" no se ve afectado).
- **Por qué:** simple y suficiente para el volumen actual; la paginación/scroll
  infinito es trabajo transversal.
- **Cuándo se resuelve:** S-G (transversales) o cuando el log supere ~500 filas.
- **Fecha:** 2026-07-13.

### [S-D] Dos implementaciones de Realtime conviviendo
- **Qué:** `useInventario` (S-C) trae su propia suscripción Realtime inline, mientras
  que las pantallas nuevas (movimientos, historial, panel) usan el hook genérico
  `useRealtime`. Hacen lo mismo (canal autenticado + re-suscripción por sesión).
- **Por qué:** no se refactorizó `useInventario` para no tocar código de S-C que ya
  funciona y está probado a mano.
- **Cuándo se resuelve:** migrar `useInventario` a `useRealtime` en un pase de limpieza
  (S-G), unificando una sola implementación.
- **Fecha:** 2026-07-13.
