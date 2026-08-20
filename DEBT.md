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
- **Estado:** ✅ RESUELTA en S-E (2026-07-13). RPC `cancelar_reserva` (CONTRACTS §2.9),
  `SECURITY DEFINER`, WMS004 si la reserva no está activa, sin movimiento de stock.

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
- **Estado:** ✅ RESUELTA en S-G (2026-07-15). Las 6 fuentes (subconjunto latino) se
  sirven desde `public/fonts/` vía `src/styles/fonts.css`; `tokens.css` ya no importa
  la CDN de Google. Cómo regenerarlas: `docs/DEPLOY.md`.

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
- **Estado:** ✅ RESUELTA en S-F (2026-07-13). El color es determinista por nombre
  (`wms_color_categoria`, migración `20260713120500_categorias_s_f.sql`) y lo asigna
  un trigger si no se envía, así que el alta en línea no tiene que inventárselo. El
  selector de categoría del formulario de Entrada ofrece "+ Crear categoría nueva…",
  que abre el mismo formulario que la pantalla de Categorías y deja la nueva
  seleccionada. Tests: `supabase/tests/05_clientes_categorias.sql`.

### [S-D] Historial limitado a los últimos 500 movimientos (sin paginación)
- **Qué:** `useMovimientos` lee `.limit(500)` ordenado por fecha desc. Con más de 500
  movimientos, los más antiguos no aparecen en el historial (el dashboard usa un
  `count` real aparte, así que "movimientos hoy" no se ve afectado).
- **Por qué:** simple y suficiente para el volumen actual; la paginación/scroll
  infinito es trabajo transversal.
- **Cuándo se resuelve:** S-G (transversales) o cuando el log supere ~500 filas.
- **Fecha:** 2026-07-13.
- **Estado:** ✅ RESUELTA en S-G (2026-07-15). `useHistorial` pagina por «ventana
  creciente» (`.range`) con «Cargar más»; el filtro de tipo se empuja a la BD y el
  contador muestra «N de TOTAL». El `useMovimientos(limite)` fijo se conserva solo
  para los 8 recientes del panel.

### [S-D] Dos implementaciones de Realtime conviviendo
- **Qué:** `useInventario` (S-C) trae su propia suscripción Realtime inline, mientras
  que las pantallas nuevas (movimientos, historial, panel) usan el hook genérico
  `useRealtime`. Hacen lo mismo (canal autenticado + re-suscripción por sesión).
- **Por qué:** no se refactorizó `useInventario` para no tocar código de S-C que ya
  funciona y está probado a mano.
- **Cuándo se resuelve:** migrar `useInventario` a `useRealtime` en un pase de limpieza
  (S-G), unificando una sola implementación.
- **Fecha:** 2026-07-13.
- **Estado:** ✅ RESUELTA en S-E (2026-07-13). `useInventario` usa ya `useRealtime`
  (conservando su debounce de 250 ms) y escucha también `reserva`.
- **Nota (S-G, 2026-07-15):** al verificar el tiempo real en vivo saltó un error del
  cliente unificado — «cannot add postgres_changes callbacks after subscribe()»:
  la conexión inicial y el evento de auth corrían a la vez y reutilizaban el canal
  cacheado por nombre. Corregido en `useRealtime` (cola serializada + nombre de canal
  único por intento). Verificado sin errores en consola y con el inventario/historial
  refrescando en vivo.

### [S-E] `dar_de_baja` desde `en_evento` descuadra `v_unidades_fuera_evento`
- **Qué:** dar de baja unidades cuyo bucket de origen es `en_evento` baja el contador
  `producto.en_evento`, pero **no** escribe un movimiento con `evento_id`. La vista
  `v_unidades_fuera_evento` (= Σ salidas − Σ devoluciones, CONTRACTS §1.4) sigue
  contando esas unidades como fuera de su evento. Consecuencias: el evento nunca llega
  a "0 fuera" (y la UI no ofrece cerrarlo), y una devolución posterior podría pasar la
  validación WMS005 y chocar contra el CHECK de `en_evento >= 0`.
- **Por qué:** hueco de diseño heredado (`dar_de_baja` es de S-A y no conoce eventos);
  el camino correcto para perder material de un evento es `devolver` con `p_perdido`,
  que sí registra el movimiento con `evento_id`. La UI de S-E solo ofrece ese camino.
- **Cuándo se resuelve:** añadir `p_evento_id` opcional a `dar_de_baja` (y exigirlo
  cuando el origen sea `en_evento`), o prohibir ese bucket como origen y remitir a
  `devolver`. Decisión de producto: hablarlo antes de tocarlo. **No es teórico:** la
  ficha de producto (S-D) permite hoy dar de baja desde `en_evento`.
- **Fecha:** 2026-07-13.
- **Estado:** ✅ RESUELTA en S-F (2026-07-13) — **Opción A** (prohibir el bucket).
  `dar_de_baja` solo admite `disponible` y `en_reparacion`; con `en_evento` lanza
  WMS007 remitiendo al check-in de devolución con unidades «perdidas» (migración
  `20260713120200_rpc_dar_de_baja_s_f.sql`, CONTRACTS §2.7). La ficha de producto
  ya no ofrece ese origen y avisa del camino correcto. Test de regresión:
  `supabase/tests/04_dar_de_baja_en_evento.sql`.

### [S-E] El check-in no es atómico entre productos
- **Qué:** el check-in llama a `devolver` una vez por producto con unidades. Cada
  llamada es su propia transacción: si la tercera línea falla, las dos primeras ya
  están registradas. La UI lo dice explícitamente en el aviso de error.
- **Por qué:** `devolver` (CONTRACTS §2.5) es por producto, y la atomicidad se exigió
  solo en `cumplir_evento`. Una devolución parcial es un estado válido del dominio
  (el material vuelve a plazos), así que media devolución registrada no es incoherente.
- **Cuándo se resuelve:** si el negocio lo pide, una RPC `devolver_evento(lineas jsonb)`
  que envuelva las líneas en una sola transacción, al estilo de `cumplir_evento`.
- **Fecha:** 2026-07-13.

### [S-E] Cerrar un evento no está protegido en la base de datos
- **Qué:** `evento.estado` se escribe por CRUD directo bajo RLS. La UI solo ofrece
  "Cerrar evento" cuando `v_unidades_fuera_evento` no devuelve nada para ese evento,
  pero la BD aceptaría un `UPDATE ... estado='cerrado'` con material fuera.
- **Por qué:** no se añadió un trigger de guardia para no dejar eventos irrecuperables:
  con la deuda de `dar_de_baja` de arriba, un evento podría quedar con "material fuera"
  fantasma y no poder cerrarse nunca.
- **Cuándo se resuelve:** junto con la deuda de `dar_de_baja`, y entonces sí un trigger
  (o una RPC `cerrar_evento`) que impida cerrar con material fuera.
- **Fecha:** 2026-07-13.
- **Nota (S-F, 2026-07-13):** el bloqueante desaparece — con `dar_de_baja` ya no se
  puede crear material fantasma, así que un evento con "material fuera" siempre
  tiene un camino de vuelta (check-in). Queda pendiente el trigger/RPC de guardia:
  se retoma en S-G. La deuda **sigue abierta**.

### [S-E] Cancelar un evento no tiene flujo
- **Qué:** el enum `estado_evento` incluye `cancelado` (DOMAIN §3.5) pero la UI no lo
  ofrece. Cancelar debería además liberar las reservas activas del evento (si no,
  seguirían bloqueando `disponible_real` de un evento que no se celebra).
- **Por qué:** el prompt de S-E no lo pedía y hacerlo bien implica decidir si la
  cancelación arrastra las reservas (y si eso es una RPC nueva o N `cancelar_reserva`).
- **Cuándo se resuelve:** S-F/S-G, o antes si el negocio lo necesita.
- **Fecha:** 2026-07-13.

### [S-E] La salida directa a evento no arranca el evento
- **Qué:** `cumplir_reserva` y `cumplir_evento` pasan el evento de `planificado` a
  `en_curso`; la `salida_evento` directa (S-D) no. Un evento puede tener material fuera
  y seguir figurando como `planificado`.
- **Por qué:** el prompt de S-E pedía el cambio de estado en el camino de cumplir; tocar
  la semántica de `salida_evento` (CONTRACTS §2.4) se salía del encargo.
- **Cuándo se resuelve:** decisión de una línea — añadir el mismo `update evento` a
  `salida_evento` y documentarlo en CONTRACTS §2.4.
- **Fecha:** 2026-07-13.

### [S-F] Cuentas de prueba creadas en la BD remota (hay que limpiarlas)
- **Qué:** para poder verificar S-F en el navegador se tocó `auth.users` del proyecto
  remoto: (1) se dio contraseña a las **cuentas demo** del seed
  (`admin.demo@suricato.local` y `trabajador.demo@suricato.local`, que nacieron sin
  contraseña en la migración puente de S-B) y se les creó su fila en
  `auth.identities`; (2) se dio de alta desde el panel el usuario
  **`trabajador.sf@suricato.local`** ("Trabajador Prueba SF"). Las tres tienen la
  contraseña `SuricatoTest2026!`.
- **Por qué:** no había ninguna credencial con la que entrar en la app para probar
  el flujo completo (alta de usuario, permisos de trabajador, fichas).
- **Cuándo se resuelve:** **antes de producción (S-G)**. Dar de baja a "Trabajador
  Prueba SF" desde el panel y quitar las contraseñas de las cuentas demo
  (`update auth.users set encrypted_password = null where email like '%.demo@suricato.local'`),
  o borrarlas si el histórico de ejemplo ya no hace falta.
- **Fecha:** 2026-07-13.
- **Estado (S-G, 2026-07-15):** herramienta lista — `scripts/purge-demo.sql` borra las
  tres cuentas `%@suricato.local` (y todos los datos demo). Lo ejecuta el humano antes
  del go-live (ver `docs/PURGE.md`); por política (CLAUDE.md §7) Claude no toca usuarios.
- **Nota (limpieza, 2026-08-20):** las cuentas demo del seed ya están **desactivadas**
  en la BD remota, y eso hacía fallar dos tests de seguridad que hardcodeaban el id
  del admin del seed (`is_admin()` exige `activo`). `scripts/db-test.mjs` ya no
  depende de ellas: descubre sus actores en la BD (admin = el `es_principal`), así
  que la purga de las cuentas demo tampoco romperá los tests.

### [S-F] `cliente.parent_id` queda en la BD sin uso
- **Qué:** la cartera es una lista plana (decisión de S-F): la UI ignora `parent_id`
  y no hay forma de crear ni ver jerarquías. La columna, su FK y su índice siguen en
  la BD, y el seed la usa ("Delegación Norte" cuelga de "Productora Nacional").
- **Por qué:** quitarla es una migración destructiva sin beneficio funcional ahora, y
  el modelo de DOMAIN la sigue documentando.
- **Cuándo se resuelve:** S-G, si se confirma que no hará falta: se elimina la columna
  (y la nota de DOMAIN §3.4). Si vuelve el árbol, ya está el soporte.
- **Fecha:** 2026-07-13.

### [S-F] La ficha de cliente lee el catálogo entero de productos
- **Qué:** `useCliente` trae `v_producto_disponible` completa para resolver los
  nombres del material fuera/reservado y filtrar los productos asignados, en vez de
  pedir solo los ids implicados.
- **Por qué:** el catálogo actual son decenas de referencias y la vista ya se lee en
  otras pantallas; una lectura más es más simple que N embeds anidados.
- **Cuándo se resuelve:** si el catálogo crece a miles de referencias (mismo umbral
  que la deuda de Realtime de S-C): filtrar por `in(ids)`.
- **Fecha:** 2026-07-13.

### [S-E] `v_conflictos_reserva` compara por pares y contra `disponible`
- **Qué:** la vista (S-A) detecta conflictos entre **pares** de eventos solapados cuya
  suma de reservas supera el bucket `disponible`. No cubre tres o más eventos que, a la
  vez, sobrepasan el stock sin que ningún par lo haga; y compara contra `disponible`, no
  contra el `disponible_real` del resto del calendario.
- **Por qué:** es la vista que fija CONTRACTS §4 y cumple el objetivo del sprint (avisar
  de solapes que no caben). Redefinirla es un cambio de contrato.
- **Cuándo se resuelve:** si aparecen falsos negativos en uso real, reescribirla como
  agregado por producto y ventana de fechas en vez de por pares.
- **Fecha:** 2026-07-13.

---

## Triage de S-G (2026-07-15)

Repaso completo de la deuda al cerrar S-G (producción). **Cerrado en S-G:** paginación
del historial y auto-hospedaje de fuentes (arriba). **Se deja abierto, justificado:**

- **Optimizaciones por volumen** (Realtime revalida el inventario entero, ficha de
  cliente lee el catálogo completo): correctas para decenas–cientos de referencias; el
  disparador para tocarlas es el mismo (miles de referencias) y no se ha alcanzado.
  Meterlas ahora es complejidad sin beneficio medible.
- **Decisiones de producto estables** (`bucket_destino` text, autor no editable,
  `username` en metadata, check-in no atómico, `cliente.parent_id` sin uso): no son
  atajos, son diseño acordado; se documentan por si se revisan.
- **Guardias de dominio pendientes** (trigger/RPC que impida cerrar un evento con
  material fuera; flujo de cancelar evento; que la salida directa arranque el evento;
  `v_conflictos_reserva` por pares): son **lógica de negocio nueva o cambios de
  contrato**. El encargo de S-G es dejar la app desplegable sin funcionalidad de
  negocio nueva, así que **no se tocan aquí**; se retoman con Persona A cuando el
  negocio los priorice. Ninguna bloquea el go-live (todas tienen camino operativo).
- **Cuentas de prueba en la BD remota** ([S-F]): las trata el script de purga
  (`scripts/purge-demo.sql`, ver `docs/PURGE.md`). Por política (CLAUDE.md §7) **no se
  crean ni modifican usuarios/contraseñas desde aquí**: el borrado de las cuentas demo
  y de `trabajador.sf` lo ejecuta el humano con ese script antes del go-live.
- **Boilerplate duplicado en las Edge Functions** ([reset-password]): `resetear-password`
  repite el bloque de `crear-usuario` que verifica el JWT del llamante y su rol de admin
  activo (~30 líneas), en vez de extraerlo a `supabase/functions/_shared/`. Se dejó así
  a propósito: cada función queda autocontenida y desplegable por separado, y el alta
  —que funciona en producción— no se toca por un cambio que no la necesita. Si aparece
  una tercera función con la misma guarda, ahí sí toca extraer el helper compartido.

---

## [ui-movil] Rejilla del mes descuadrada por encima de 860 px

- **Qué:** en la vista "Mes" del calendario las columnas son `1fr`, que es
  `minmax(auto, 1fr)`: el nombre de un evento largo ensancha la columna de su día, así
  que cada semana puede medir distinto y ninguna cuadra del todo con la cabecera de
  días. Se ve, por ejemplo, en la semana que lleva "Congreso Anual Telefónica".
- **Por qué:** el arreglo es una línea (`min-width: 0` en `.mes__celda`), pero cambia el
  dibujo de la rejilla en escritorio y el encargo de este sprint era explícito: "en
  pantalla ancha se mantiene la rejilla actual tal cual". Aplicado solo por debajo de
  860 px, donde además era la diferencia entre caber en el panel o recortarse.
- **Cuándo se resuelve:** cuando se pueda tocar el aspecto de escritorio, quitando el
  `@media (max-width: 860px)` que envuelve `.mes__celda { min-width: 0 }` en
  `src/pages/Calendario.css` y subiendo la regla al bloque base.
- **Fecha:** 2026-08-19.
- **Estado:** ✅ RESUELTA en el sprint de limpieza (2026-08-20). `min-width: 0` está
  ya en el bloque base de `.mes__celda`, así que las siete columnas miden lo mismo en
  cualquier ancho. En el `@media (max-width: 860px)` solo queda el `min-width` de
  `.mes` (la rejilla estrecha de tablet).

---

## [ui-movil] La tabla de Administración sigue pidiendo scroll lateral en móvil

- **Qué:** `.admin__tabla` tiene `min-width: 640px` y su panel `overflow-x: auto`, así
  que en un móvil hay que arrastrar la tabla para llegar a la columna de acciones.
- **Por qué:** es una decisión anterior y deliberada (está comentada en `Admin.css`), y
  el fallo de este sprint era la **alineación** de los botones con su fila, no el
  scroll. Convertir la tabla en tarjetas apiladas es un rediseño, no un arreglo de
  maquetación.
- **Cuándo se resuelve:** si el uso desde móvil del panel de administración deja de ser
  ocasional, rehacer la tabla como lista de tarjetas por debajo de 640 px.
- **Fecha:** 2026-08-19.
