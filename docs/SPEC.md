# SPEC.md — Especificación funcional

Sistema WMS de Suricato Producciones. Describe **qué hace** el sistema, módulo a
módulo. El modelo de datos y las invariantes están en `DOMAIN.md`.

Cambio de fondo respecto al manual original: el material se **alquila y vuelve**.
La antigua "salida de stock" (descuento permanente) se sustituye por el ciclo
**reserva → salida a evento → devolución**. El stock total solo baja cuando algo
se da de baja o se pierde.

Arquitectura: SPA en React (Vite) + Supabase (Postgres, Auth, Storage, Realtime,
RLS). Todos los usuarios con credenciales ven el mismo estado en tiempo real.

---

## 1. Autenticación y usuarios

- Login con **email** y contraseña vía Supabase Auth. Sesión persistente. Los datos
  de aplicación (rol, nombre, estado) viven en la tabla `perfil`, que cuelga de
  `auth.users` (ver `DOMAIN.md §3.1`).
- Cada operación registra automáticamente el `perfil` autenticado que la ejecuta
  (`auth.uid()`); el cliente no elige el autor.
- **Roles** (aplicados por RLS en el servidor, no solo en el cliente):
  - `admin`: acceso completo, incluida gestión de usuarios, categorías y ajustes.
  - `trabajador`: operaciones del día a día; sin configuración del sistema.
- El `perfil` principal (`es_principal = true`) está protegido: no puede eliminarse.
  Los usuarios se dan de baja lógica (`activo = false`) para preservar el histórico
  que los referencia.

## 2. Panel principal (dashboard)

Métricas en tiempo real:
- **Referencias**: número de productos distintos.
- **Unidades en stock**: suma del total operativo (`disponible + en_evento + en_reparacion`).
- **Movimientos hoy**: entradas, salidas a evento, devoluciones, ajustes y bajas del día.
- **Reservas activas**: reservas pendientes de cumplir.
- **Eventos próximos**: eventos planificados por fecha de inicio.
- **Clientes**: total de clientes.

Además:
- **Alerta de stock bajo**: banner destacado cuando algún producto tiene
  `disponible_real ≤ stock_minimo`. Umbral configurable por producto.
- **Movimientos recientes**: tabla con tipo, producto, evento/cliente, usuario,
  cantidad y fecha, con acceso al historial completo.
- **Desglose por categoría**: barras proporcionales con unidades por categoría.

## 3. Inventario

Núcleo de consulta. La tabla muestra, por producto:
- Foto (miniatura → lightbox), nombre (→ ficha), categoría (chip de color), ubicación.
- **Desglose de stock por bucket**: `disponible` / `en_evento` / `en_reparacion`,
  y `disponible_real` si hay reservas. Sustituye al "estado único" del manual: un
  producto con 10 focos y 4 en un evento se muestra como 6 disponibles / 4 en evento,
  no como un único estado.
- Mínimo configurado (en rojo si `disponible_real ≤ minimo`).
- Última actualización.

Filtros y orden: búsqueda por texto; filtro por categoría; filtro por bucket
(dónde están las unidades); orden por nombre, por stock o por ubicación.

**Ficha detallada** (modal): foto grande, desglose completo de buckets + reservas,
mínimo, categoría, propietario (Suricato o cliente), ubicación, dimensiones y peso,
fechas. Acciones de estado (enviar a reparación, marcar reparado, dar de baja) que
ejecutan las RPC correspondientes.

## 4. Entrada de stock

Registra la llegada de mercancía (`disponible += n`). Si el producto existe, suma;
si es nuevo, lo crea.

- Autocompletado de producto (con foto, categoría y stock actual).
- Categoría con autocompletado; se puede crear nueva.
- Stock mínimo (default 5), ubicación (autocompletado), dimensiones (opcionales).
- Foto (JPG/PNG/WebP, máx. 5 MB) → Supabase Storage.
- Cliente asignado opcional: etiqueta el producto para un cliente (ver `DOMAIN.md` §6).
- Usuario que registra: precargado con el logueado, editable.
- Comportamiento inteligente: si el producto existe, se precargan foto, medidas,
  categoría, ubicación y mínimo; solo se actualiza lo que el usuario cambie.

## 5. Salida a evento  *(antes "salida de stock")*

Mueve unidades `disponible → en_evento`. **No reduce el total.**

- Autocompletado con `disponible_real` visible.
- Verificación: exige `disponible_real ≥ unidades`; si no, se bloquea con aviso.
- Se asocia a un evento (y por tanto a su cliente). Usuario y unidades registrados.
- Puede originarse manualmente o automáticamente al **cumplir una reserva**.

## 6. Devolución / check-in  *(módulo nuevo)*

Cierra el ciclo cuando el material vuelve del evento. Espejo de la salida.

- Se parte del material `en_evento` de un evento.
- Por cada producto, el operario reparte las unidades que vuelven:
  - **OK** → `disponible`.
  - **Roto** → `en_reparacion`.
  - **Perdido / destruido** → `baja` (−total, con motivo).
- Genera los movimientos de `devolucion` correspondientes.
- Un evento con todo el material devuelto puede pasar a `cerrado`.

## 7. Ajuste de inventario

Corrige discrepancias fijando el valor de un bucket (no suma/resta).

- Solo productos existentes. Muestra el valor actual destacado.
- El usuario introduce el valor correcto; previsualización anterior → nuevo con la
  diferencia en verde/rojo.
- **Motivo obligatorio** (recuento, merma, rotura, error previo…).
- Queda en el historial con badge propio (anterior, nuevo, motivo) y filtro propio.

## 8. Reservas

Compromiso anticipado de material. Cada reserva es una línea de producto dentro de
un **evento**.

- Al crear: producto (con `disponible_real` visible), unidades (valida contra
  `disponible_real`), y el evento al que pertenece.
- **Estados**: `activa` (bloquea `disponible_real`), `cumplida` (genera salida a
  evento y mueve a `en_evento`), `cancelada` (libera el bloqueo, sin mover stock).
- Impacto en inventario: mientras está activa, el producto muestra total,
  reservado y `disponible_real`. Las alertas de mínimo usan `disponible_real`.

## 9. Eventos  *(módulo nuevo — habilitado por la decisión A)*

El evento agrupa las reservas de material para un proyecto y su ventana de fechas.

- Datos: nombre, cliente (opcional), `fecha_inicio`–`fecha_fin`, notas, estado.
- **Hoja de carga / packing list**: listado del material del evento, exportable a
  PDF, para llevar físicamente al montaje.
- **Calendario y detección de conflictos**: vista por fechas que avisa cuando un
  producto está comprometido en eventos con rangos solapados y no hay unidades
  suficientes para ambos.

## 10. Historial de movimientos

Registro completo e inmutable: entrada, salida a evento, devolución, ajuste, baja.

- Por movimiento: tipo (badge por color), producto, evento/cliente, usuario,
  cantidad (o anterior/nuevo en ajustes), motivo cuando aplica, fecha y hora.
- Filtros por tipo y búsqueda libre (producto, usuario, cliente, motivo).

## 11. Clientes

Cartera con visibilidad de material, eventos e historial.

- **Lista plana** con buscador *(decidido en S-F: no hay árbol de clientes — los
  "hijos" de un cliente son sus eventos, no otros clientes)*. Por cliente: color,
  contacto, si tiene material fuera ahora y cuántos eventos próximos.
- **Color propio** de una paleta apagada, asignado automáticamente al crearlo y
  cambiable desde la ficha. Se usa en las barras del calendario y en los chips de
  cliente (listado, ficha de evento, historial), **no** en la tabla de inventario.
- Ficha: datos de contacto editables y selector de color; **eventos en curso** (los
  que tienen material suyo fuera ahora, con qué material y cuántas unidades);
  **eventos próximos** (planificados, con su material reservado); **eventos pasados**;
  **stock asignado** (productos con `cliente_id` = cliente); e **historial** de
  movimientos del cliente.

## 12. Categorías

- Gestión (crear, editar, eliminar) **abierta a cualquier usuario autenticado**
  *(S-F; la RLS se relajó en S-D y el borrado en S-F)*. Predefinidas: Audio, Vídeo,
  Iluminación, Estructuras, Consumibles, Otros.
- Color propio, estable y determinista por nombre; se puede cambiar dentro de la
  paleta de categorías.
- Se asignan al registrar entradas — y se pueden **crear en línea** desde el propio
  formulario de Entrada; el inventario y el dashboard filtran/desglosan por categoría.
- **Al eliminar una categoría, sus productos NO se borran: quedan sin categoría** y
  se pueden reasignar. El histórico de movimientos no se toca (DOMAIN §3.2).

## 13. Panel de administración (solo admin)

- **Usuarios** (`perfil`): crear (email, nombre, contraseña, rol) vía Edge Function
  con service role, listar con su rol y estado (activo / dado de baja), y dar de baja
  lógica (excepto el `es_principal`, que ni siquiera muestra el botón — invariante 8).
- **Restablecer contraseña**: el admin fija una contraseña nueva a cualquier usuario
  activo vía la Edge Function `resetear-password` (service role). **No hay
  recuperación por email** — la app no envía correos: el admin comunica la contraseña
  por un canal aparte, y el diálogo lo advierte. La contraseña del `es_principal`
  solo puede cambiarla él mismo (a los demás admins no se les ofrece el botón, y el
  servidor lo comprueba igualmente): sin esa guarda, un admin secundario podría
  apropiarse de la cuenta que §15 declara protegida.
- Las **categorías** tienen pantalla propia (§12) y no son solo del admin.

## 14. Características transversales

- **Tiempo real**: los cambios se propagan a todos los clientes vía Supabase
  Realtime, sin recargar.
- **Fotos**: en Supabase Storage con CDN; no cuentan contra el límite de base de datos.
- **Export / backup**: exportación de inventario y movimientos a CSV/Excel;
  backup automático diario de la base de datos (fuera del plan free de Supabase).
- **Notificaciones**: toasts de éxito/error en cada operación.
- **Autocompletado** en todos los campos de producto (foto, categoría, stock).
- **Lightbox** de fotos a pantalla completa (cierre con clic exterior o ESC).
- **Accesibilidad**: formularios navegables por teclado; Enter confirma.
- **Diseño**: interfaz limpia con branding Suricato; sidebar de navegación; responsive
  en escritorio.

## 15. Validaciones de seguridad

- Verificación de `disponible_real` antes de salidas y de cumplir reservas.
- Motivo obligatorio en ajustes y bajas.
- Roles aplicados por RLS en el servidor.
- Admin principal protegido; usuarios con baja lógica.
- Invariantes de stock garantizadas en la base de datos (ver `DOMAIN.md` §4).

## 16. Fuera de alcance de v1

- Etiquetado físico QR / código de barras y número de serie (modelo preparado).
