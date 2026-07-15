# DEPLOY.md — Despliegue del frontend en Cloudflare Pages

El frontend es una SPA de Vite; el backend es Supabase (ya desplegado). Este documento
deja los pasos exactos para publicar el frontend en **Cloudflare Pages**. **El deploy lo
hace el humano** desde el dashboard de Cloudflare; Claude solo deja todo preparado.

> Regla de oro: **ningún secreto en el repo.** En el frontend solo vive la clave
> *publishable/anon* (pública por diseño, protegida por RLS). La `service_role`
> (`sb_secret_…`) **jamás** se pone en Cloudflare ni en el código.

---

## 1. Requisitos previos

- El repo está en GitHub.
- El proyecto Supabase está en marcha y conoces:
  - **VITE_SUPABASE_URL** → `https://<ref>.supabase.co`
    (Supabase → Project Settings → Data API → Project URL).
  - **VITE_SUPABASE_PUBLISHABLE_KEY** → la clave *publishable / anon*
    (Supabase → Project Settings → API Keys → `anon` / `publishable`).
- `npm run build` produce `dist/` en local (ver §4).

## 2. Crear el proyecto en Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Autoriza y elige el repositorio de GitHub. Rama de producción: `main`.
3. **Build settings:**
   - **Framework preset:** *None* (o *Vite*, es indiferente si pones lo de abajo).
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** *(vacío; el proyecto está en la raíz del repo)*
4. No guardes todavía si te deja añadir variables; si no, se añaden en el paso 3.

## 3. Variables de entorno en Cloudflare

Pages → tu proyecto → **Settings** → **Variables and secrets** (entorno
**Production**, y **Preview** si quieres previews de ramas):

| Nombre                          | Valor                                   |
| ------------------------------- | --------------------------------------- |
| `VITE_SUPABASE_URL`             | `https://<ref>.supabase.co`             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | la clave *publishable / anon*           |

- Son **variables de build** (Vite las incrusta al compilar con el prefijo `VITE_`).
  Si las cambias, hay que **volver a desplegar** para que tomen efecto.
- **No** añadas aquí la `service_role` ni la contraseña de la BD.
- Tras añadirlas, lanza un **Retry deployment** / **Create deployment** para que el
  build las recoja.

## 4. Verificar el build en local (antes de desplegar)

```bash
npm ci
npm run build      # genera dist/ (tsc -b && vite build)
npm run preview    # sirve dist/ en http://localhost:4173 para una última comprobación
```

`dist/` debe contener `index.html`, `assets/`, `fonts/` y **`_redirects`**.

## 5. Routing SPA — `public/_redirects`

La app usa `BrowserRouter`, así que las rutas de cliente (`/inventario`, `/historial`…)
no existen como ficheros: al recargar una URL profunda, el servidor debe devolver
`index.html` y dejar que React Router resuelva. Eso lo hace:

```
# public/_redirects  → se copia tal cual a dist/_redirects
/*    /index.html   200
```

Cloudflare Pages lee `_redirects` de la raíz de la salida. Sin este fichero, recargar
en cualquier ruta que no sea `/` daría un 404. **No lo borres.**

## 6. Dominio y HTTPS

Cloudflare Pages sirve por HTTPS en `*.pages.dev` automáticamente. Para un dominio
propio: Pages → **Custom domains** → añade el dominio y sigue el asistente de DNS.

---

## 7. Fuentes auto-hospedadas (mantenimiento)

Las fuentes (Space Grotesk + Inter, subconjunto latino) viven en `public/fonts/*.woff2`
y se declaran en `src/styles/fonts.css`. No hay llamada a la CDN de Google. Si algún día
hay que regenerarlas (nuevo peso, otro subconjunto), el proceso fue: descargar los
`.woff2` del `@font-face` de Google Fonts (subconjunto `latin`) a `public/fonts/` y
ajustar `src/styles/fonts.css`. No requiere tocar el deploy.

---

## 8. Backup automático de la BD (verificación) — workflow `backup.yml`

El backup **no** es parte de Cloudflare: corre en **GitHub Actions** (`.github/workflows/
backup.yml`), hace `pg_dump` diario y guarda el volcado como *artefacto* del run.

### Secrets que necesita (GitHub → Settings → Secrets and variables → Actions)

| Secret            | Valor                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `SUPABASE_DB_URL` | Cadena de conexión Postgres (URI) del proyecto Supabase.          |

> **Importante (IPv4):** los runners de GitHub Actions son IPv4, y la conexión
> **directa** de Supabase (`db.<ref>.supabase.co`) es solo IPv6. Usa la cadena del
> **Session pooler** (Supabase → Project Settings → Database → Connection string →
> pestaña **Session pooler**; host tipo `aws-0-<region>.pooler.supabase.com`, puerto
> 5432). El *session* pooler soporta `pg_dump`; el *transaction* pooler **no**.
> Contiene la contraseña de la BD → es un secreto, nunca al repo.

### Comprobar que el backup ha corrido

1. GitHub → pestaña **Actions** → workflow **"Backup diario de la BD"**.
2. Para lanzarlo a mano la primera vez: **Run workflow** (botón de
   `workflow_dispatch`) sobre `main`.
3. Abre el run más reciente y confirma:
   - El job **dump** está en verde.
   - El paso *"pg_dump de la base de datos"* imprime el tamaño del volcado (> 0).
   - En **Artifacts** (al final del run) aparece `backup-AAAAMMDD-HHMMSS.sql`
     descargable (retención 30 días).
4. Descarga el artefacto y ábrelo: debe ser SQL (`CREATE TABLE …`, `COPY …`), no estar
   vacío. Ese fichero es el que restaurarías con `psql "$SUPABASE_DB_URL" -f backup-….sql`.

El cron es diario a las **03:17 UTC**. Si el run falla por conexión, casi siempre es el
tema IPv4/pooler de arriba.

## 9. Keepalive anti-pausa — workflow `keepalive.yml`

El plan free de Supabase pausa el proyecto tras ~7 días sin actividad. `keepalive.yml`
hace un GET ligero al endpoint REST cada 3 días (06:00 UTC).

### Secrets que necesita

| Secret                     | Valor                                        |
| -------------------------- | -------------------------------------------- |
| `SUPABASE_URL`             | `https://<ref>.supabase.co` (igual que la del front). |
| `SUPABASE_PUBLISHABLE_KEY` | la clave *publishable / anon* (igual que la del front). |

### Comprobar

GitHub → **Actions** → **"Keepalive Supabase"** → **Run workflow**. El run debe imprimir
`Respuesta HTTP: 200` (o 404) y quedar en verde. Aquí **basta la anon key**; nunca la
`service_role`.

---

## Checklist de go-live

- [ ] Variables `VITE_*` configuradas en Cloudflare (Production) y build verde.
- [ ] La app carga por HTTPS y una recarga en `/historial` no da 404 (`_redirects` OK).
- [ ] Login con el admin real funciona (ver `docs/BOOTSTRAP.md`).
- [ ] Secrets de GitHub puestos; **backup** y **keepalive** ejecutados a mano una vez y
      en verde; artefacto de backup descargable.
- [ ] Purga de datos demo ejecutada **cuando toque** (`docs/PURGE.md`) — no antes.
