# supabase/migrations

Migraciones SQL versionadas del proyecto WMS.

Ahora mismo está **vacío a propósito**: el esquema (tablas, enums, invariantes,
RPC y vistas) se construye en el sprint **S-A** (ver `docs/ROADMAP.md`). En S-0 solo
se dejan preparados los cimientos, sin nada de lógica de negocio.

## Convenciones (a aplicar en S-A)

- Un fichero por migración, con prefijo ordenable por tiempo:
  `NNNN_descripcion.sql` (p. ej. `0001_schema_inicial.sql`).
- Las migraciones son **inmutables** una vez aplicadas: los cambios posteriores se
  hacen en una migración nueva, nunca editando una ya aplicada.
- La lógica transaccional dura (buckets, transiciones, reservas) vive en funciones
  de Postgres (RPC), según `docs/DOMAIN.md` y `docs/CONTRACTS.md`.
- Las invariantes de `docs/DOMAIN.md §4` se implementan como `CHECK`/constraints o
  triggers, no solo en el cliente.
