# ROADMAP.md — Plan de sprints

**Proyecto:** WMS · Suricato Producciones
**Versión:** 0.1 (Fase 1)
**Última actualización:** 2026-07-08

Parte el sistema descrito en `SPEC.md` / `DOMAIN.md` / `CONTRACTS.md` en sprints
ordenados por dependencias. Cada sprint se convertirá en un prompt para Claude Code.

**Orden de construcción (por qué así):** primero el motor de datos y sus reglas,
validado en aislado; luego la seguridad; después la UI de dentro hacia fuera
(consulta → operaciones → ciclo de alquiler → gestión). La UI nunca va por delante de
las reglas que la sostienen.

**Paralelización:** el `CONTRACTS.md` es la frontera. Una vez cerrado S-A, la Persona B
(frontend) puede trabajar contra los contratos mientras la Persona A (backend) sigue
con S-B.

---

## Principios de trabajo (resumen; el detalle irá en `CLAUDE.md`)

- Claude Code **commitea, nunca hace push/merge/PR**. Eso lo haces tú.
- Ramas de feature; **nunca `main`** directamente.
- Auditar antes de modificar. Commits pequeños y convencionales.
- Ninguna deuda silenciosa: lo que se pospone se anota en `DEBT.md`.
- El frontend nunca escribe buckets: todo pasa por las RPC de `CONTRACTS.md`.

---

## S-0 · Setup e infraestructura *(corresponde a la Fase 4)*

**Objetivo:** cimientos listos, cero código de negocio.

**Entregables:**
- `git init` en `almacen-app2/`; estructura de carpetas (`docs/`, `src/`, `supabase/`).
- Proyecto Supabase creado (plan free); `.env` con URL + anon key; cliente Supabase
  configurado en el front.
- Scaffold React + Vite mínimo que arranca (`npm run dev`).
- `CLAUDE.md`, `GITFLOW.md`, `DEBT.md` en la raíz.
- GitHub Actions: backup diario (`pg_dump`) + ping anti-pausa cada 3 días.

**DoD:** `npm run dev` levanta; el front conecta con Supabase; se trabaja sobre rama
de feature, no `main`.

**Persona:** A + B (compartido).

---

## S-A · Núcleo de datos y RPC (el motor)

**Objetivo:** esquema completo + RPC + invariantes, validado en aislado, sin UI.

**Entregables:**
- Migraciones SQL: tablas, enums, y las invariantes 1, 2, 7, 8 como `CHECK`/constraints.
- Las 8 RPC de `CONTRACTS.md §2`, con bloqueo de fila (`FOR UPDATE`).
- Vistas derivadas de `CONTRACTS.md §4`.
- Datos sintéticos (seed): categorías por defecto, productos, movimientos de ejemplo.
- Tests pgTAP que prueban las invariantes 1–8 **y la concurrencia** (dos `salida_evento`
  simultáneas no pueden sobrevender).

**Depende de:** S-0.

**DoD:** suite de tests en verde; ninguna RPC permite romper una invariante; seed cargado.

**Persona:** A.

---

## S-B · Auth y RLS

**Objetivo:** identidad y permisos reales, en el servidor.

**Entregables:**
- Supabase Auth por email; tabla `perfil` + trigger de alta ligado a `auth.users`.
- Políticas RLS por rol para todas las tablas (lectura/escritura según §1.3 de contratos).
- Edge Function de alta de usuarios (service role); protección del admin principal.

**Depende de:** S-A.

**DoD:** un `trabajador` no puede ejecutar `ajustar` ni `dar_de_baja` ni leer datos de
admin — comprobado a nivel de política, no solo de UI.

**Persona:** A.

---

## S-C · Front base + Inventario

**Objetivo:** esqueleto de la app y la pantalla núcleo de consulta.

**Entregables:**
- Layout (sidebar oscuro, branding Suricato), routing, pantalla de login.
- Inventario: tabla con desglose de buckets (`disponible`/`en_evento`/`en_reparacion`
  y `disponible_real`), filtros (texto, categoría, bucket), orden, chips de categoría.
- Ficha de producto (modal) con lightbox de foto.
- Suscripción Realtime al inventario.

**Depende de:** S-A (contratos), S-B. Puede empezar en paralelo a S-B.

**DoD:** inventario real desde Supabase; un cambio hecho en otro cliente aparece en vivo.

**Persona:** B.

---

## S-D · Movimientos + Dashboard

**Objetivo:** operaciones del día a día.

**Entregables:**
- Formularios Entrada, Salida a evento y Ajuste (con previsualización anterior→nuevo).
- Acciones de `marcar_reparado` y `dar_de_baja` desde la ficha.
- Historial de movimientos con filtros por tipo y búsqueda.
- Dashboard: métricas, alerta de stock bajo, movimientos recientes, desglose por categoría.

**Depende de:** S-C.

**DoD:** cada formulario llama a su RPC; los errores `WMS###` se muestran como toast; el
dashboard cuadra con los datos.

**Persona:** B.

---

## S-E · Ciclo de alquiler: Reservas, Eventos, Devolución

**Objetivo:** lo que diferencia a este WMS de un inventario normal.

**Entregables:**
- Gestión de Eventos (nombre, cliente, `fecha_inicio`–`fecha_fin`, estado).
- Crear reserva (línea de evento) y cumplir reserva.
- Devolución / check-in con reparto OK / roto / perdido.
- Calendario con detección de conflictos (rangos solapados sobre-reservando un producto).
- Packing list por evento, exportable a PDF.

**Depende de:** S-D. (Backend de vistas de conflicto = Persona A.)

**DoD:** el ciclo reserva → salida → devolución funciona de punta a punta; el conflicto de
fechas avisa; el PDF se genera.

**Persona:** B (+ A para vistas).

---

## S-F · Clientes, Categorías, Admin

**Objetivo:** cartera y configuración.

**Entregables:**
- Árbol jerárquico de clientes + ficha (stock asignado por `cliente_id`, reservas
  activas, historial).
- Gestión de categorías (admin).
- Panel de administración de usuarios (alta con rol, baja lógica, admin principal protegido).

**Depende de:** S-B, S-D.

**DoD:** la ficha de cliente muestra su material y sus reservas; el admin gestiona usuarios
y categorías.

**Persona:** B.

---

## S-G · Transversales, deploy y cierre

**Objetivo:** llevarlo a producción.

**Entregables:**
- Export CSV/Excel de inventario y movimientos.
- Pulido: toasts, accesibilidad por teclado, responsive de escritorio.
- Deploy del front en Cloudflare Pages.
- Verificación del backup automático y del ping anti-pausa.
- Repaso de `DEBT.md`.

**Depende de:** todo lo anterior.

**DoD:** app desplegada y accesible; backup verificado funcionando; deuda registrada.

**Persona:** A + B.

---

## Mapa de dependencias

```
S-0 → S-A → S-B → ─┐
             └→ S-C → S-D → S-E
                          └→ S-F
   (todo) ─────────────────────→ S-G
```

## Fuera de alcance de v1

Etiquetado QR/código de barras y número de serie (modelo preparado, ver `DOMAIN.md §7`).
