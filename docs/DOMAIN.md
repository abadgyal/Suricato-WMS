# DOMAIN.md — Modelo de dominio

Sistema WMS de Suricato Producciones. Este documento define las entidades, los
estados y las **invariantes** que la base de datos hace cumplir. Es la fuente de
verdad del modelo: el esquema de Postgres y la lógica de negocio derivan de aquí.

> Regla de oro: la lógica transaccional dura (buckets, transiciones, reservas)
> vive en funciones de Postgres (RPC), no en el cliente. El frontend nunca
> escribe stock directamente.

---

## 1. Concepto central: buckets de estado

Cada producto es **stock fungible por cantidad** (no por número de serie). Sus
unidades se reparten en *buckets* según su situación operativa:

| Bucket           | Significado                                    |
|------------------|------------------------------------------------|
| `disponible`     | En el almacén, listo para usar.                |
| `en_evento`      | Fuera del almacén, alquilado en un evento.     |
| `en_reparacion`  | No operativo, en reparación o mantenimiento.   |

Las unidades que se dan de **baja** o se **pierden** salen del total (no son un
bucket operativo; se registran en el histórico y en un contador acumulado).

La **reserva** es una capa lógica *encima* de `disponible`, no un bucket físico:
compromete unidades que aún están en el almacén.

```
disponible_real = disponible − reservas_activas_del_producto
total_operativo = disponible + en_evento + en_reparacion
```

Las alertas de stock mínimo se calculan sobre `disponible_real`, nunca sobre el total.

---

## 2. Máquina de estados de las unidades

```
[entrada]        → disponible                     (+total)
disponible       → en_evento        salida a evento / cumplir reserva
en_evento        → disponible       devolución OK
en_evento        → en_reparacion    devuelto roto
en_evento        → baja/pérdida     pérdida o destrucción      (−total)
en_reparacion    → disponible       reparado
en_reparacion    → baja/pérdida     irreparable                (−total)
[ajuste]         → fija valores de buckets (con motivo)
```

**El total solo decrece con baja/pérdida.** Ir a un evento nunca reduce el total:
solo mueve unidades entre buckets. Esta es la diferencia central con el manual
original, donde la "salida" descontaba stock de forma permanente.

---

## 3. Entidades

### 3.1 usuario / perfil
La autenticación la gestiona **Supabase Auth**. La tabla de aplicación `perfil`
cuelga de `auth.users` (mismo `id`) y guarda el rol y los datos de negocio.

| Campo          | Tipo      | Notas                                        |
|----------------|-----------|----------------------------------------------|
| `id`           | uuid PK   | = `auth.users.id`                            |
| `nombre`       | text      | Nombre visible del trabajador.               |
| `rol`          | enum      | `admin` \| `trabajador`                      |
| `activo`       | bool      | Soft-delete. Nunca se borra físicamente.     |
| `es_principal` | bool      | El admin principal protegido (no eliminable).|

> Login: Supabase Auth autentica por email. Cada trabajador entra con su **email
> real**; el admin le asigna el rol (`admin` o `trabajador`) al darlo de alta. El
> reseteo de contraseña por email queda disponible de serie. La creación de usuarios
> por el admin se hace vía Edge Function con service role.

### 3.2 categoria
| Campo    | Tipo    | Notas                                             |
|----------|---------|---------------------------------------------------|
| `id`     | uuid PK |                                                   |
| `nombre` | text U  | Único.                                            |
| `color`  | text    | Color generado de forma determinista y estable.   |

Predefinidas: Audio, Vídeo, Iluminación, Estructuras, Consumibles, Otros.

> **Color (S-F).** Si el alta no indica color, lo asigna el trigger
> `trg_categoria_color`, determinista **por nombre** (`wms_color_categoria`), de la
> paleta viva de categorías. Esto es lo que permite crear una categoría en línea
> desde el formulario de Entrada sin pedir un color.

> **Borrado (S-F).** Una categoría se puede eliminar (cualquier autenticado). Sus
> **productos no se borran: quedan sin categoría** (`producto.categoria_id` → NULL,
> `ON DELETE SET NULL`). El histórico de `movimiento` no referencia categorías, así
> que no se ve afectado. El inventario y el dashboard muestran esos productos como
> "Sin categoría" (fila propia en `v_stock_por_categoria`) y se les puede reasignar
> una categoría desde la ficha de producto.

### 3.3 producto
| Campo                  | Tipo      | Notas                                          |
|------------------------|-----------|------------------------------------------------|
| `id`                   | uuid PK   |                                                |
| `nombre`               | text      |                                                |
| `categoria_id`         | uuid FK NULL | → categoria. **(S-F)** NULL = sin categoría (p. ej. si se borró la suya). |
| `foto_path`            | text NULL | Ruta en Supabase Storage (bucket `productos`). |
| `stock_minimo`         | int       | Umbral de alerta. Default 5.                   |
| `ubicacion`            | text NULL | Estantería / pasillo / zona.                   |
| `disponible`           | int       | Bucket. ≥ 0. Default 0.                        |
| `en_evento`            | int       | Bucket. ≥ 0. Default 0.                        |
| `en_reparacion`        | int       | Bucket. ≥ 0. Default 0.                        |
| `baja_acumulada`       | int       | Contador histórico de bajas/pérdidas. ≥ 0.     |
| `cliente_id`           | uuid FK NULL | Cliente al que está asignado el producto. NULL = sin asignar. Ver §6. |
| `largo_cm`             | numeric NULL |                                             |
| `ancho_cm`             | numeric NULL |                                             |
| `alto_cm`              | numeric NULL |                                             |
| `peso_kg`              | numeric NULL |                                             |
| `creado_en`            | timestamptz |                                              |
| `actualizado_en`       | timestamptz |                                              |

`total_operativo` es derivado (`disponible + en_evento + en_reparacion`).

### 3.4 cliente
| Campo       | Tipo         | Notas                                     |
|-------------|--------------|-------------------------------------------|
| `id`        | uuid PK      |                                           |
| `nombre`    | text         |                                           |
| `contacto`  | text NULL    | Persona de contacto.                      |
| `email`     | text NULL    |                                           |
| `telefono`  | text NULL    |                                           |
| `color`     | text         | **(S-F)** Color del cliente. NOT NULL.    |
| `parent_id` | uuid FK NULL | Jerarquía en árbol (→ cliente). **Sin uso** (S-F). |

> **Color (S-F).** Se asigna solo al crear el cliente (trigger `trg_cliente_color`,
> determinista por `id`): ningún cliente queda sin color. Se puede cambiar desde su
> ficha, siempre dentro de una **paleta deliberada** de tonos apagados/desaturados
> (`wms_paleta_cliente()`): no compite con los colores de bucket (verde/azul/ámbar/
> rojo = estado de stock) ni con los chips de categoría. Se usa en las barras del
> calendario y en los chips de cliente; **no** en la tabla de inventario, donde
> mandan buckets y categorías.

> **Sin árbol de clientes (S-F).** La cartera es una **lista plana**: los "hijos" de
> un cliente son sus eventos, no otros clientes. `parent_id` se conserva en la BD
> (dato del seed) pero la UI lo ignora. Un evento puede no tener cliente.

### 3.5 evento  *(entidad de primera clase — decisión A)*
| Campo          | Tipo         | Notas                                      |
|----------------|--------------|--------------------------------------------|
| `id`           | uuid PK      |                                            |
| `nombre`       | text         | Obligatorio.                               |
| `cliente_id`   | uuid FK NULL | → cliente.                                 |
| `fecha_inicio` | date         | Rango para detección de conflictos.        |
| `fecha_fin`    | date         |                                            |
| `estado`       | enum         | `planificado` \| `en_curso` \| `cerrado` \| `cancelado` |
| `notas`        | text NULL    |                                            |
| `creado_por`   | uuid FK      | → perfil.                                  |
| `creado_en`    | timestamptz  |                                            |

### 3.6 reserva
Línea de reserva de un producto dentro de un evento (evento 1—N reservas).

| Campo         | Tipo    | Notas                                          |
|---------------|---------|------------------------------------------------|
| `id`          | uuid PK |                                                |
| `evento_id`   | uuid FK | → evento (aporta fechas y cliente).            |
| `producto_id` | uuid FK | → producto.                                    |
| `unidades`    | int     | > 0.                                           |
| `estado`      | enum    | `activa` \| `cumplida` \| `cancelada`          |
| `notas`       | text NULL |                                              |
| `creado_por`  | uuid FK | → perfil.                                       |
| `creado_en`   | timestamptz |                                            |

### 3.7 movimiento  *(log inmutable, append-only)*
| Campo            | Tipo         | Notas                                      |
|------------------|--------------|--------------------------------------------|
| `id`             | uuid PK      |                                            |
| `tipo`           | enum         | `entrada` \| `salida_evento` \| `devolucion` \| `ajuste` \| `baja` |
| `producto_id`    | uuid FK      | → producto.                                |
| `evento_id`      | uuid FK NULL | → evento (salida/devolución de evento).    |
| `cliente_id`     | uuid FK NULL | → cliente (asociación opcional).           |
| `usuario_id`     | uuid FK      | → perfil (quién registró).                 |
| `unidades`       | int NULL     | Para entrada/salida/devolución/baja.       |
| `bucket_origen`  | enum NULL    | Transición de estado.                      |
| `bucket_destino` | enum NULL    | Transición de estado.                      |
| `valor_anterior` | int NULL     | Solo `ajuste`.                             |
| `valor_nuevo`    | int NULL     | Solo `ajuste`.                             |
| `motivo`         | text NULL    | **Obligatorio** en `ajuste` y `baja`.      |
| `creado_en`      | timestamptz  |                                            |

La devolución se materializa por su `bucket_destino`: `disponible` (OK),
`en_reparacion` (roto) o `baja` (pérdida).

---

## 4. Invariantes (garantías de la base de datos)

Se implementan como `CHECK`, constraints o funciones/triggers en Postgres.
El frontend puede validar por UX, pero la garantía real es la de abajo.

1. `total_operativo = disponible + en_evento + en_reparacion` en todo momento.
2. Ningún bucket es negativo: `disponible, en_evento, en_reparacion, baja_acumulada ≥ 0`.
3. `disponible_real = disponible − Σ(reservas activas del producto) ≥ 0` al crear/editar una reserva.
4. Una `salida_evento` exige `disponible_real ≥ unidades` en el momento de ejecutarse.
5. El total solo decrece vía `baja` (o `devolucion`→`baja`); `salida_evento` nunca reduce el total.
6. Los movimientos son inmutables: sin `UPDATE`/`DELETE`. Una corrección es un `ajuste` nuevo.
7. `ajuste` y `baja` requieren `motivo` no vacío.
8. El perfil con `es_principal = true` no puede eliminarse; los usuarios se dan de baja lógica (`activo = false`).

Concurrencia: las mutaciones de stock corren dentro de una función RPC con bloqueo
de fila (`SELECT ... FOR UPDATE`) para que el picking simultáneo no rompa las
invariantes 1–4.

---

## 5. Operaciones que mutan stock (RPC atómicas)

| Operación              | Efecto en buckets                                   |
|------------------------|-----------------------------------------------------|
| `registrar_entrada`    | `disponible += n` (crea producto si es nuevo).      |
| `crear_reserva`        | No mueve buckets; bloquea `disponible_real`.        |
| `cumplir_reserva`      | `disponible → en_evento` por `n`; reserva→cumplida; genera `salida_evento`. |
| `salida_evento` directa| `disponible → en_evento` por `n`.                   |
| `devolver`             | `en_evento → {disponible \| en_reparacion \| baja}` por líneas. |
| `reparado`             | `en_reparacion → disponible` por `n`.               |
| `dar_de_baja`          | `{disponible \| en_evento \| en_reparacion} → baja` (−total), con motivo. |
| `ajustar`              | Fija el valor de un bucket; registra anterior/nuevo + motivo. |

Toda operación escribe exactamente un `movimiento` y actualiza `actualizado_en`.

---

## 6. Stock asignado a cliente

Todo el material está en el almacén de Suricato; **no existe stock propiedad de un
cliente**. La relación es una **asignación**: cada producto lleva una etiqueta
opcional de a qué cliente está dedicado.

Se modela con `producto.cliente_id`:
- `NULL` → producto sin asignar (stock genérico de Suricato).
- valor → producto asignado a ese cliente.

Así, "material del cliente X" = productos con `cliente_id = X`, lo que alimenta
directamente su ficha. La asignación es solo una dimensión sobre nuestros productos:
no cambia las mecánicas de stock (buckets, reservas, eventos), que funcionan igual
haya o no cliente asignado.

Un cliente puede existir sin ningún producto asignado. La asociación *puntual* de un
movimiento concreto a un cliente (histórico) se guarda además en
`movimiento.cliente_id`.

> Por defecto `cliente_id` es opcional (permite stock genérico). Si se decide que
> todo producto deba llevar cliente, se marca `NOT NULL`.

---

## 7. Fuera de alcance de v1 (modelo preparado)

- **Etiquetado QR / código de barras y número de serie.** No se implementa el flujo
  físico. El modelo queda preparado: una futura tabla `unidad_serie(producto_id,
  codigo, estado)` colgaría de `producto` sin romper el modelo por cantidad.
