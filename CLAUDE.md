# CLAUDE.md — WMS Suricato Producciones

Instrucciones para Claude Code. Léelas al empezar cada sesión.

## Qué es esto
WMS (gestión de almacén) para una productora de eventos audiovisuales. El material
se **alquila y vuelve**: sale a un evento y regresa. Varios usuarios ven el mismo
estado en tiempo real.

## Stack
- Frontend: React + Vite + TypeScript (SPA).
- Backend/datos: Supabase — Postgres, Auth, Storage, Realtime, RLS.
- Lógica transaccional dura: funciones de Postgres (RPC). No en el cliente.

## Documentos fuente — léelos antes de tocar código
- `docs/SPEC.md` — qué hace el sistema, módulo a módulo.
- `docs/DOMAIN.md` — modelo de datos, buckets e invariantes. **Fuente de verdad.**
- `docs/CONTRACTS.md` — firmas de las RPC. Frontera exacta front ↔ base de datos.
- `docs/ROADMAP.md` — sprints y su criterio de "hecho".

> Si el código contradice a estos documentos, gana el documento hasta que se actualice
> explícitamente.

## Estructura del repo
```
almacen-app2/
  docs/            documentos de arquitectura
  src/             frontend React
  supabase/        migraciones y funciones SQL
  CLAUDE.md  GITFLOW.md  DEBT.md
```

## Reglas de trabajo — innegociables
1. **Commiteas, pero NUNCA haces push, merge ni abres PR.** Eso lo hace el humano.
2. Trabaja siempre en una **rama de feature**. Nunca toques `main` directamente.
3. **Audita antes de modificar:** lee el fichero y entiende el contexto antes de cambiarlo.
4. **Commits pequeños y convencionales** (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
5. Lo que pospongas se anota en `DEBT.md`. Nada de deuda silenciosa.
6. Si escribes lógica de negocio, **escribe también sus tests**. Verifica tu trabajo.

## Reglas del dominio — críticas
- El frontend **NUNCA** escribe las columnas de bucket (`disponible`, `en_evento`,
  `en_reparacion`). Toda mutación de stock pasa por una RPC de `docs/CONTRACTS.md`.
- Respeta las invariantes de `docs/DOMAIN.md §4/§5`. Si una tarea las rompería, **para
  y avisa** en vez de forzarla.
- Ninguna clave secreta (`sb_secret_...` / `service_role`) en el frontend ni en el repo.
  Solo la publishable/anon en `.env` (gitignored).
- Nada de datos en `localStorage`: la fuente de verdad es Supabase.

## Comandos
- Desarrollo: `npm run dev`
- (Tests y migraciones se añaden en S-A.)

## Idioma
- Documentos y textos de la UI en **español**. Identificadores de código en inglés.
