# CONTRACTS.md — Contratos de la API

**Proyecto:** WMS · Suricato Producciones
**Versión:** 0.1 (Fase 1)
**Última actualización:** 2026-07-08

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
| WMS004  | Reserva no está `activa`                                          |
| WMS005  | Devolución excede las unidades fuera de ese producto en el evento |
| WMS006  | Producto inexistente                                              |
| WMS007  | Bucket de origen sin unidades suficientes                         |
| WMS008  | Rango de fechas inválido (`fecha_fin < fecha_inicio`)             |
| WMS009  | Permiso denegado para la operación (rol insuficiente)            |

### 1.3 Roles (aplicados por RLS + comprobación en RPC)
- **trabajador**: `registrar_entrada`, `salida_evento`, `crear_reserva`,
  `cumplir_reserva`, `devolver`, `marcar_reparado`. Lecturas.
- **admin**: todo lo anterior + `ajustar`, `dar_de_baja`, gestión de usuarios y
  categorías.

> *Punto a confirmar:* ¿`dar_de_baja` como acción independiente debe ser solo admin,
> o también trabajador? (La baja *dentro* de una devolución por pérdida sí la hace el
> trabajador.) Por defecto: `dar_de_baja` standalone = admin.

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

### 2.1 `registrar_entrada`
Llegada de mercancía. Suma a `disponible`. Si `p_producto_id` es `null`, crea el
producto con los metadatos de alta.

| Parámetro       | Tipo   | Oblig. | Notas                                            |
|-----------------|--------|--------|--------------------------------------------------|
| p_producto_id   | uuid   | no     | Si `null`, se crea producto nuevo.               |
| p_unidades      | int    | sí     | > 0.                                             |
| p_cliente_id    | uuid   | no     | Asignación del producto (solo en alta).          |
| p_usuario_id    | uuid   | sí     | Quien registra.                                  |
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
| p_usuario_id  | uuid | sí     |                                        |
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
| p_usuario_id | uuid | sí     |       |

- **Validación:** reserva en estado `activa`; `disponible_real ≥ unidades`.
- **Efecto:** `disponible → en_evento` por las unidades de la reserva; reserva pasa a
  `cumplida`; genera movimiento `salida_evento` ligado al evento.
- **Errores:** WMS004, WMS001.

### 2.4 `salida_evento`
Salida directa a un evento sin reserva previa.

| Parámetro     | Tipo | Oblig. | Notas |
|---------------|------|--------|-------|
| p_producto_id | uuid | sí     |       |
| p_unidades    | int  | sí     | > 0.  |
| p_evento_id   | uuid | sí     |       |
| p_usuario_id  | uuid | sí     |       |

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
| p_usuario_id  | uuid | sí     |                                                |
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
| p_usuario_id  | uuid | sí     |       |

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
| p_bucket_origen | text | sí     | `disponible` \| `en_evento` \| `en_reparacion` |
| p_usuario_id    | uuid | sí     |                                          |
| p_motivo        | text | sí     | Obligatorio.                             |

- **Validación:** el bucket de origen tiene `≥ p_unidades`.
- **Efecto:** `<bucket_origen> -= p_unidades`; `total` decrece; `baja_acumulada +=
  p_unidades`. Movimiento `baja`.
- **Rol:** admin (ver §1.3).
- **Errores:** WMS007, WMS002, WMS003, WMS009.

### 2.8 `ajustar`
Fija el valor de un bucket para cuadrar con el recuento físico.

| Parámetro     | Tipo | Oblig. | Notas                                          |
|---------------|------|--------|------------------------------------------------|
| p_producto_id | uuid | sí     |                                                |
| p_bucket      | text | sí     | `disponible` \| `en_evento` \| `en_reparacion` |
| p_valor_nuevo | int  | sí     | ≥ 0.                                           |
| p_usuario_id  | uuid | sí     |                                                |
| p_motivo      | text | sí     | Obligatorio.                                   |

- **Efecto:** fija el bucket a `p_valor_nuevo`. Movimiento `ajuste` con
  `valor_anterior` y `valor_nuevo`.
- **Rol:** admin (ver §1.3).
- **Errores:** WMS002 (`p_valor_nuevo < 0`), WMS003, WMS009.

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

- Rol para `dar_de_baja` standalone (§1.3): por defecto admin. Confirmar.
- ¿La edición de metadatos de producto (ubicación, foto) es libre para trabajador o
  solo admin? Por defecto: trabajador puede.
