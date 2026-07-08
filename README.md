# WMS · Suricato Producciones

Sistema de gestión de almacén (WMS) para una productora de eventos audiovisuales. El
material se **alquila y vuelve**: sale a un evento y regresa. Varios usuarios ven el
mismo estado en tiempo real.

- **Frontend:** React + Vite + TypeScript (SPA).
- **Backend/datos:** Supabase — Postgres, Auth, Storage, Realtime, RLS.
- La lógica transaccional dura vive en funciones de Postgres (RPC), no en el cliente.

Documentación de arquitectura en [`docs/`](docs/): `SPEC.md` (qué hace),
`DOMAIN.md` (modelo de datos e invariantes, fuente de verdad), `CONTRACTS.md`
(firmas de las RPC) y `ROADMAP.md` (sprints). El flujo de trabajo con Git está en
[`GITFLOW.md`](GITFLOW.md) y la deuda técnica en [`DEBT.md`](DEBT.md).

## Requisitos

- **Node.js 22 o superior** (recomendado el LTS activo).
- npm (viene con Node).

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar el entorno: copia la plantilla y rellena los valores de tu proyecto Supabase
cp .env.example .env
#   En Windows (PowerShell): Copy-Item .env.example .env
#   Edita .env y rellena:
#     VITE_SUPABASE_URL             URL del proyecto (https://xxxx.supabase.co)
#     VITE_SUPABASE_PUBLISHABLE_KEY clave publishable/anon (Project Settings → API)

# 3. Arrancar el servidor de desarrollo
npm run dev
```

Vite indicará la URL local (por defecto <http://localhost:5173>).

> **Importante:** `.env` está en `.gitignore` y **nunca** se versiona. Solo se usa la
> clave publishable/anon (pública por diseño, protegida por RLS). La `service_role` /
> `sb_secret_...` no debe aparecer nunca en el frontend ni en el repositorio.

## Scripts

| Comando           | Qué hace                                   |
|-------------------|--------------------------------------------|
| `npm run dev`     | Servidor de desarrollo con recarga en caliente. |
| `npm run build`   | Comprueba tipos (`tsc -b`) y compila para producción. |
| `npm run preview` | Sirve localmente el build de producción.   |

## Estructura

```
almacen-app2/
  docs/                 documentos de arquitectura (fuente de verdad)
  src/
    lib/supabase.ts     cliente Supabase (lee de import.meta.env)
    App.tsx, main.tsx   scaffold mínimo de la SPA
  supabase/migrations/  migraciones SQL versionadas (se llenan en S-A)
  .github/workflows/    backup diario de la BD + keepalive anti-pausa
  CLAUDE.md GITFLOW.md DEBT.md
```

## Automatización (GitHub Actions)

- **`backup.yml`** — `pg_dump` diario de la base de datos, guardado como artefacto.
  Requiere el secret `SUPABASE_DB_URL`.
- **`keepalive.yml`** — ping cada 3 días al endpoint REST para evitar la pausa por
  inactividad del plan free. Requiere los secrets `SUPABASE_URL` y
  `SUPABASE_PUBLISHABLE_KEY`.

Los secrets se configuran en GitHub → Settings → Secrets and variables → Actions.
Cada workflow documenta en sus comentarios los secrets que necesita.

## Estado

En construcción por sprints (ver [`docs/ROADMAP.md`](docs/ROADMAP.md)). Sprint actual:
**S-0** — cimientos e infraestructura, sin lógica de negocio.
