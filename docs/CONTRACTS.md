# CONTRACTS.md — Contratos de la API

**Proyecto:** WMS · Suricato Producciones
**Versión:** 0.1 (Fase 1)
**Última actualización:** 2026-07-13 (S-E: `cancelar_reserva`, `cumplir_evento`)

Define la frontera exacta entre el frontend (React + Vite) y la base de datos
(Supabase/Postgres). Toda mutación de stock pasa por una **función RPC** que
garantiza las invariantes de `DOMAIN.md §5`. Las lecturas y el CRUD simple pasan por
la API REST autogenerada de Supabase bajo RLS.

> Regla: el frontend **nunca** escribe las columnas de bucket (`disponible`,
> `en_evento`, `en_reparacion`) directamente. Solo las RPC de aquí las tocan.

---

## 1. Convenciones

### 1.1 Retorno estándar de las RPC de stock
Salvo que se indique otra cosa, cada RPC de mutación devuelve el estado resultante
del producto y el id del movimiento generado:

```json
{
  "producto_id": "uuid",
  "disponible": 6,
  "en_evento": 4,
  "en_reparacion": 0,
  "total": 10,
  "movimiento_id": "uuid"
}
```

El frontend usa este retorno para refrescar la UI sin recargar. (Realtime propaga
además el cambio al resto de clientes.)

> Excepción: `devolver` (§2.5) puede generar **varios** movimientos (uno por
> destino OK/roto/perdido), así que amplía este retorno con `movimiento_ids`
> (array); `movimiento_id` conserva el primero por compatibilidad.

### 1.2 Formato de errores
Las RPC lanzan `RAISE EXCEPTION` con un código estable en el mensaje. Supabase lo
entrega al cliente. Formato: `WMSNNN: mensaje`.

| Código  | Significado                                                        |
|---------|-------------------------------------------------------------------|
| WMS001  | Stock insuficiente (`disponible_real < unidades`)                 |
| WMS002  | Cantidad inválida (`unidades <= 0`)                               |
| WMS003  | Motivo obligatorio y vacío                                        |
| WMS004  | Reserva o evento no está en un estado válido para la operación     |
| WMS005  | Devolución excede las unidades fuera de ese producto en el evento |
| WMS006  | Producto o evento inexistente                                      |
| WMS007  | Bucket de origen inválido o sin unidades suficientes              |
| WMS008  | Rango de fechas inválido (`fecha_fin < fecha_inicio`)             |
| WMS009  | Permiso denegado para la operación (rol insuficiente)            |

### 1.3 Roles (aplicados por RLS + comprobación en RPC)
- **cualquier autenticado** (`trabajador` o `admin`): todas las operaciones de
  stock — `registrar_entrada`, `salida_evento`, `crear_reserva`,
  `cumplir_reserva`, `devolver`, `marcar_reparado`, **`ajustar`** y
  **`dar_de_baja`** — más el historial y el dashboard. Lecturas. CRUD directo de
  cliente y evento; **crear/editar categorías**; edición de metadatos de producto
  (no buckets).
- **solo admin**: gestión de usuarios — Edge Function `crear-usuario` y RPC
  `desactivar_usuario` (WMS009 si no) — y **borrar** categorías.

> **Actualizado (S-D):** el reparto de S-B se relaja. `ajustar` y `dar_de_baja`
> pasan a estar abiertas a cualquier usuario autenticado (ya **no** lanzan WMS009
> por rol; solo si no hay sesión). Las categorías se pueden crear/editar por
> cualquier autenticado (el DELETE queda solo-admin). Lo único que sigue reservado
> a admin es la gestión de usuarios.

> **Autor de cada operación (S-B):** las RPC ya **no** reciben `p_usuario_id`. El
> autor del movimiento es siempre `current_perfil_id()` (= `auth.uid()`), el
> usuario autenticado real. El cliente no puede suplantar autoría.

### 1.4 Unidades fuera por evento (derivado)
`en_evento` es un contador agregado por producto. Para validar devoluciones se usa el
valor por par producto–evento, derivado del log inmutable:

```
unidades_fuera(producto, evento) =
    Σ salida_evento.unidades  −  Σ devolucion.unidades   (para ese producto y evento)
```

No requiere columnas nuevas; se calcula sobre `movimiento`.

---

## 2. RPC de mutación de stock

> **S-B:** ninguna RPC recibe ya `p_usuario_id`. El autor del movimiento es
> `current_perfil_id()` (= `auth.uid()`).
>
> **S-D:** `ajustar` y `dar_de_baja` **ya no exigen `is_admin()`**: cualquier
> autenticado puede ejecutarlas (solo lanzan WMS009 si no hay sesión). Únicamente
> `desactivar_usuario` sigue exigiendo `is_admin()` (WMS009).

### 2.1 `registrar_entrada`
Llegada de mercancía. Suma a `disponible`. Si `p_producto_id` es `null`, crea el
producto con los metadatos de alta.

| Parámetro       | Tipo   | Oblig. | Notas                                            |
|-----------------|--------|--------|--------------------------------------------------|
| p_producto_id   | uuid   | no     | Si `null`, se crea producto nuevo.               |
| p_unidades      | int    | sí     | > 0.                                             |
| p_cliente_id    | uuid   | no     | Asignación del producto (solo en alta).          |
| p_nombre        | text   | alta   | Requerido si se crea producto.                   |
| p_categoria_id  | uuid   | no     | Solo alta.                                        |
| p_stock_minimo  | int    | no     | Solo alta. Default 5.                            |
| p_ubicacion     | text   | no     | Solo alta / actualización explícita.             |
| p_foto_path     | text   | no     | Ruta en Storage.                                 |
| p_dimensiones   | jsonb  | no     | `{largo,ancho,alto,peso}`, solo alta.            |

- **Efecto:** `disponible += p_unidades`. Movimiento `entrada`.
- **Errores:** WMS002, WMS006 (si `p_producto_id` dado no existe).

### 2.2 `crear_reserva`
Bloquea unidades de `disponible` para un evento. No mueve buckets.

| Parámetro     | Tipo | Oblig. | Notas                                  |
|---------------|------|--------|----------------------------------------|
| p_evento_id   | uuid | sí     | → evento.                              |
| p_producto_id | uuid | sí     |                                        |
| p_unidades    | int  | sí     | > 0.                                   |
| p_notas       | text | no     |                                        |

- **Validación:** `disponible_real ≥ p_unidades`.
- **Efecto:** crea `reserva` en estado `activa`. No hay movimiento (aún no hay stock
  físico movido).
- **Retorno:** la fila `reserva` creada.
- **Errores:** WMS001, WMS002.

### 2.3 `cumplir_reserva`
Materializa una reserva: mueve el stock y la cierra.

| Parámetro    | Tipo | Oblig. | Notas |
|--------------|------|--------|-------|
| p_reserva_id | uuid | sí     |       |

- **Validación:** reserva en estado `activa`; `disponible_real ≥ unidades`.
- **Efecto:** `disponible → en_evento` por las unidades de la reserva; reserva pasa a
  `cumplida`; genera movimiento `salida_evento` ligado al evento. **(S-E)** además,
  si el evento estaba `planificado`, pasa a `en_curso`: hay material fuera.
- **Errores:** WMS004, WMS001.

### 2.4 `salida_evento`
Salida directa a un evento sin reserva previa.

| Parámetro     | Tipo | Oblig. | Notas |
|---------------|------|--------|-------|
| p_producto_id | uuid | sí     |       |
| p_unidades    | int  | sí     | > 0.  |
| p_evento_id   | uuid | sí     |       |

- **Validación:** `disponible_real ≥ p_unidades`.
- **Efecto:** `disponible → en_evento`. Movimiento `salida_evento`.
- **Errores:** WMS001, WMS002.

### 2.5 `devolver`
Check-in del material que vuelve de un evento. Reparte las unidades entre destinos.

| Parámetro     | Tipo | Oblig. | Notas                                          |
|---------------|------|--------|------------------------------------------------|
| p_evento_id   | uuid | sí     |                                                |
| p_producto_id | uuid | sí     |                                                |
| p_ok          | int  | sí     | Vuelven bien → `disponible`. ≥ 0.              |
| p_roto        | int  | sí     | Vuelven rotas → `en_reparacion`. ≥ 0.          |
| p_perdido     | int  | sí     | No vuelven → `baja` (−total). ≥ 0.             |
| p_motivo      | text | cond.  | Obligatorio si `p_perdido > 0`.                |

- **Validación:** `p_ok + p_roto + p_perdido ≤ unidades_fuera(producto, evento)`
  (ver §1.4). `p_ok + p_roto + p_perdido > 0`.
- **Efecto:** `en_evento` baja en el total repartido; `disponible += p_ok`,
  `en_reparacion += p_roto`, `total -= p_perdido`. Genera uno o varios movimientos
  `devolucion` (uno por destino con unidades > 0).
- **Retorno:** retorno estándar (§1.1) + `movimiento_ids` (array con todos los
  movimientos generados; `movimiento_id` es el primero del array).
- **Errores:** WMS005, WMS002, WMS003 (si `p_perdido > 0` sin motivo).

### 2.6 `marcar_reparado`
Devuelve al almacén material reparado.

| Parámetro     | Tipo | Oblig. | Notas |
|---------------|------|--------|-------|
| p_producto_id | uuid | sí     |       |
| p_unidades    | int  | sí     | > 0.  |

- **Validación:** `en_reparacion ≥ p_unidades`.
- **Efecto:** `en_reparacion → disponible`. Movimiento `devolucion`
  (origen `en_reparacion`, destino `disponible`).
- **Errores:** WMS007, WMS002.

### 2.7 `dar_de_baja`
Retira unidades del total operativo de forma permanente.

| Parámetro       | Tipo | Oblig. | Notas                                    |
|-----------------|------|--------|------------------------------------------|
| p_producto_id   | uuid | sí     |                                          |
| p_unidades      | int  | sí     | > 0.                                     |
| p_bucket_origen | text | sí     | `disponible` \| `en_reparacion`. **`en_evento` NO se admite** (S-F). |
| p_motivo        | text | sí     | Obligatorio.                             |

- **Validación:** el bucket de origen es `disponible` o `en_reparacion` y tiene
  `≥ p_unidades`.
- **Efecto:** `<bucket_origen> -= p_unidades`; `total` decrece; `baja_acumulada +=
  p_unidades`. Movimiento `baja`.
- **Rol:** cualquier autenticado (S-D; antes solo admin). Ver §1.3.
- **Errores:** WMS007, WMS002, WMS003, WMS009 (solo si no hay sesión).

> **Material en un evento (S-F).** `en_evento` **no** es un origen válido de baja
> y la RPC lanza WMS007 remitiendo al camino correcto. Motivo: una baja no lleva
> `evento_id`, así que bajar desde `en_evento` dejaba las unidades contadas como
> fuera en `v_unidades_fuera_evento` (§1.4) — material fantasma: el evento no
> podía cerrarse y una devolución posterior podía chocar con el CHECK de no
> negativos. El material que se pierde en un evento se registra en el **check-in
> de devolución** con `p_perdido` (§2.5), que sí liga la baja a su evento. La UI
> de la ficha de producto solo ofrece `disponible` y `en_reparacion`.

### 2.8 `ajustar`
Fija el valor de un bucket para cuadrar con el recuento físico.

| Parámetro     | Tipo | Oblig. | Notas                                          |
|---------------|------|--------|------------------------------------------------|
| p_producto_id | uuid | sí     |                                                |
| p_bucket      | text | sí     | `disponible` \| `en_evento` \| `en_reparacion` |
| p_valor_nuevo | int  | sí     | ≥ 0.                                           |
| p_motivo      | text | sí     | Obligatorio.                                   |

- **Efecto:** fija el bucket a `p_valor_nuevo`. Movimiento `ajuste` con
  `valor_anterior` y `valor_nuevo`.
- **Rol:** cualquier autenticado (S-D; antes solo admin). Ver §1.3.
- **Errores:** WMS002 (`p_valor_nuevo < 0`), WMS003, WMS009 (solo si no hay sesión).

### 2.9 `cancelar_reserva`  *(S-E)*
Libera una reserva activa. **No mueve stock.**

| Parámetro    | Tipo | Oblig. | Notas |
|--------------|------|--------|-------|
| p_reserva_id | uuid | sí     |       |

- **Validación:** la reserva existe y está `activa`.
- **Efecto:** la reserva pasa a `cancelada`; `disponible_real` recupera esas
  unidades. **No** genera movimiento: una reserva es una capa lógica sobre
  `disponible` (DOMAIN §1), y cancelarla no es un hecho físico.
- **Retorno:** la fila `reserva` actualizada (igual que `crear_reserva`).
- **Errores:** WMS004 (no existe o no está activa), WMS009.

### 2.10 `cumplir_evento`  *(S-E)*
Materializa **todas** las reservas activas de un evento de una vez, reutilizando
la lógica de `cumplir_reserva` línea a línea.

| Parámetro   | Tipo | Oblig. | Notas |
|-------------|------|--------|-------|
| p_evento_id | uuid | sí     |       |

- **Validación:** el evento existe y está `planificado` o `en_curso`; tiene al
  menos una reserva activa; cada línea cumple `disponible_real ≥ unidades`.
- **Atomicidad:** o salen todas las líneas o no sale ninguna. Si una falla, la
  excepción se propaga y la transacción revierte las ya materializadas; el
  mensaje dice **qué producto** falló.
- **Efecto:** por cada reserva activa, `disponible → en_evento` + movimiento
  `salida_evento` + reserva a `cumplida`; el evento pasa a `en_curso`.
- **Retorno:** no es el estándar de §1.1 (toca varios productos):

```json
{
  "evento_id": "uuid",
  "estado": "en_curso",
  "reservas_cumplidas": 3,
  "unidades": 12,
  "lineas": [{ "reserva_id": "uuid", "producto_id": "uuid", "producto": "Foco LED", "unidades": 4 }],
  "movimiento_ids": ["uuid"]
}
```

- **Errores:** WMS006 (evento inexistente), WMS004 (evento cerrado/cancelado, o
  sin reservas activas), WMS001 (alguna línea sin stock), WMS009.

---

## 3. Lecturas y CRUD por REST + RLS (sin RPC)

Estas operaciones no tocan buckets y pasan por la API REST autogenerada, filtradas
por RLS:

- **Lecturas:** inventario, ficha de producto, historial de movimientos, reservas,
  eventos, clientes, categorías, dashboard. (El dashboard puede apoyarse en vistas
  SQL: `v_dashboard_metricas`, `v_stock_por_categoria`.)
- **CRUD simple:** crear/editar categoría (admin), crear/editar cliente, crear/editar
  evento, editar metadatos de producto (nombre, foto, ubicación, dimensiones — **no**
  buckets).
- **Estado del evento:** `planificado → en_curso` lo hacen las RPC al sacar material
  (§2.3/§2.10). **Cerrar** (`en_curso → cerrado`) y **cancelar** un evento son un
  `UPDATE` directo sobre `evento.estado`: no mueven stock, así que no necesitan RPC.
  La UI solo ofrece cerrar cuando `v_unidades_fuera_evento` no devuelve nada para ese
  evento (SPEC §6).
- **Gestión de usuarios:** alta con rol vía Edge Function con service role (no desde
  el cliente); baja lógica (`activo = false`); el admin principal no se elimina.

---

## 4. Vistas derivadas (solo lectura)

| Vista                    | Contenido                                                  |
|--------------------------|------------------------------------------------------------|
| `v_producto_disponible`  | Producto + `disponible_real` (= disponible − reservas activas) |
| `v_stock_por_categoria`  | Suma de `total` por categoría (para el dashboard)          |
| `v_unidades_fuera_evento`| `unidades_fuera(producto, evento)` (ver §1.4)              |
| `v_conflictos_reserva`   | Eventos con rangos solapados que sobre-reservan un producto |

---

## 5. Puntos abiertos

- ~~Rol para `dar_de_baja` standalone~~ → **resuelto (S-D):** cualquier autenticado.
- ~~Edición de metadatos de producto~~ → trabajador puede (confirmado).
- ~~Falta una RPC `cancelar_reserva`~~ → **resuelto (S-E):** §2.9.
