# GITFLOW.md — Flujo de trabajo con Git

Reglas de ramas y commits del proyecto WMS. Complementa a `CLAUDE.md`.

## Principio

- `main` es la rama estable. **Nunca se trabaja directamente sobre `main`.**
- Todo cambio se hace en una **rama de feature** que sale de `main`.
- **Claude Code commitea, pero nunca hace `push`, `merge` ni abre PR.** Esas acciones
  (integrar a `main` y publicar) las hace **siempre el humano**.

## Ramas de feature

Nombre descriptivo con prefijo del sprint o del tipo de trabajo:

```
feat/s0-setup
feat/sa-esquema-rpc
fix/ajuste-motivo-obligatorio
chore/actualizar-deps
```

Flujo:

```bash
git checkout main
git pull                      # (lo hace el humano)
git checkout -b feat/mi-cambio
# ... trabajo + commits pequeños ...
```

## Commits convencionales

Formato: `tipo: descripción breve en imperativo`.

Tipos:

| Tipo     | Uso                                                        |
|----------|------------------------------------------------------------|
| `feat`   | Nueva funcionalidad.                                       |
| `fix`    | Corrección de un bug.                                      |
| `chore`  | Tareas de mantenimiento (deps, config, scaffolding).       |
| `docs`   | Solo documentación.                                        |
| `test`   | Añadir o corregir tests.                                   |
| `refactor` | Cambio interno sin alterar comportamiento.              |

Reglas:

- **Commits pequeños y atómicos**: un commit = un cambio con sentido propio.
- Si escribes lógica de negocio, incluye sus **tests** (misma o adyacente entrega).
- Lo que se pospone se anota en `DEBT.md`. Nada de deuda silenciosa.

## Integración (solo humano)

1. El humano revisa la rama de feature.
2. Hace `push` de la rama a GitHub.
3. Abre PR, revisa y hace `merge` a `main`.

Claude Code **se detiene antes de este punto**: deja los commits hechos en la rama
de feature y avisa.
