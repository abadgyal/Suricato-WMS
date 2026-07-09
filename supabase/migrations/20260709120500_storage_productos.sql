-- ============================================================================
-- S-D · Bucket de Storage `productos` para las fotos (saldo de deuda [S-C]).
-- Fuente: prompt S-D (bloque 3), docs/DOMAIN.md §3.3, docs/SPEC.md §4/§14.
--
-- Deja el bucket de fotos creado de forma reproducible (antes se asumía que
-- existía). Reglas:
--   * public = true  → lectura pública por CDN (getPublicUrl). Las fotos de
--     material no son sensibles y así se muestran sin firmar URLs.
--   * file_size_limit = 5 MiB y allowed_mime_types = JPG/PNG/WebP: la propia
--     API de Storage rechaza subidas fuera de esos límites (además del chequeo
--     en cliente).
--   * Subida (INSERT en storage.objects) permitida a cualquier autenticado.
--
-- Idempotente: ON CONFLICT en el bucket y DROP POLICY IF EXISTS en las políticas.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'productos', 'productos', true,
  5242880,                                             -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lectura pública de los objetos del bucket (bucket público; explícito para
-- listados y para dejar la intención clara).
drop policy if exists productos_lectura_publica on storage.objects;
create policy productos_lectura_publica on storage.objects
  for select to public
  using (bucket_id = 'productos');

-- Subida: cualquier usuario autenticado puede subir fotos al bucket.
drop policy if exists productos_subida_autenticada on storage.objects;
create policy productos_subida_autenticada on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos');

-- Actualizar/reemplazar la propia foto (p. ej. re-subir con upsert): autenticado.
drop policy if exists productos_update_autenticada on storage.objects;
create policy productos_update_autenticada on storage.objects
  for update to authenticated
  using (bucket_id = 'productos')
  with check (bucket_id = 'productos');
