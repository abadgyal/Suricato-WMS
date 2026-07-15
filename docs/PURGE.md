# PURGE.md — Purga de datos de prueba antes del go-live

`scripts/purge-demo.sql` deja la base **limpia de datos de ejemplo** para arrancar
en producción. Lo lanza **el humano una sola vez**, en septiembre, justo antes del
go-live. **Claude no lo ejecuta.**

> ⚠ **Es irreversible.** Borra de forma permanente todos los datos de negocio y las
> cuentas de demostración. No hay "deshacer". Ten un backup verificado antes.

---

## Qué hace

Dentro de **una transacción** e **idempotente** (se puede volver a lanzar sin daño):

1. **Degrada** cualquier `es_principal` que aún sea una cuenta demo (blindaje: evita
   que el borrado en cascada choque con el trigger `WMS_PRINCIPAL`).
2. **Vacía los datos de negocio** en orden de claves foráneas (hijo → padre):
   `movimiento` → `reserva` → `evento` → `producto` → `cliente`.
   - `movimiento` es un log *append-only* protegido por el trigger de inmutabilidad
     `trg_movimiento_no_delete`. El script lo **desactiva solo durante la
     transacción** y lo reactiva acto seguido (si algo falla, el rollback también lo
     restaura).
3. **Elimina las cuentas de auth demo** `%@suricato.local` (borrar el usuario de
   `auth.users` cascadea a su `perfil`, `identities` y `sessions`). Cubre
   `admin.demo@`, `trabajador.demo@` y `trabajador.sf@`.
4. **Deja las categorías en las 6 por defecto** (borra las extra; recrea las que
   falten con su color determinista).
5. **Verifica** al final: 0 filas de negocio, 6 categorías y ≥1 admin activo. Si no
   queda ningún admin, **aborta** (rollback).

## Qué preserva

- El **esquema** completo (tablas, enums, constraints, índices, triggers).
- Las **RPC**, las **vistas** y las **políticas RLS**.
- La **cuenta admin real** (`jaime.abad@…`) y su perfil `es_principal`. Queda fuera
  del borrado por construcción (el filtro es `%@suricato.local`).
- Las **6 categorías** por defecto (Audio, Vídeo, Iluminación, Estructuras,
  Consumibles, Otros).

## Requisitos previos

1. **Backup reciente y verificado** (ver [DEPLOY.md](DEPLOY.md) → "Comprobar el backup").
2. Confirmar que apuntas a la **base de producción** correcta.
3. Confirmar que el **admin real** ya existe y es el principal
   (ver [BOOTSTRAP.md](BOOTSTRAP.md)). Si no, el script aborta en el paso de
   verificación para no dejarte sin acceso.

## Cómo lanzarlo

Se ejecuta como rol **`postgres`** (propietario de las tablas: el paso 2 desactiva un
trigger, y eso exige ser owner).

**Opción A — Dashboard de Supabase (recomendada):**
1. Supabase → **SQL Editor** → **New query**.
2. Pega el contenido de `scripts/purge-demo.sql`.
3. **Run**. Revisa los `NOTICE` del final (filas de negocio = 0, categorías = 6,
   admins ≥ 1).

**Opción B — `psql` con la cadena de servicio:**
```bash
psql "$SUPABASE_DB_URL" -f scripts/purge-demo.sql
```
(`SUPABASE_DB_URL` es la cadena de conexión de servicio; **no** la subas al repo.)

## Después

1. Inicia sesión en la app con el **admin real** y comprueba que el inventario, el
   historial y la cartera de clientes están **vacíos**.
2. Da de alta el material real con el módulo de Movimientos → Entrada.
3. Da de alta al resto de usuarios reales desde el **Panel de administración**
   (Edge Function `crear-usuario`). Recuerda la regla de CLAUDE.md §7: las
   credenciales las gestiona el humano.
