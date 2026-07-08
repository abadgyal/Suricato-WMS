# DEBT.md — Registro de deuda técnica

Todo lo que se pospone o se deja a medias se anota aquí. **Nada de deuda silenciosa.**

Cada entrada: qué se pospuso, por qué, y el sprint o condición en que se retoma.

## Formato

```
### [S-X] Título breve
- **Qué:** descripción del atajo o de lo que falta.
- **Por qué:** motivo de posponerlo.
- **Cuándo se resuelve:** sprint / condición.
- **Fecha:** AAAA-MM-DD.
```

---

### [S-A→S-B] RLS, roles y WMS009 no aplicados en las RPC
- **Qué:** las 8 RPC reciben `p_usuario_id` como parámetro y NO comprueban rol ni
  aplican RLS. `dar_de_baja`/`ajustar` no lanzan `WMS009` todavía. Las funciones se
  crearon con `SECURITY INVOKER` (por defecto) y sin `GRANT` a `anon`/`authenticated`.
- **Por qué:** identidad y permisos son el objetivo de S-B; S-A se centra en la
  lógica transaccional y las invariantes, validadas en aislado.
- **Cuándo se resuelve:** S-B (Auth + RLS): trigger `perfil` ↔ `auth.users`,
  políticas por rol, `SECURITY DEFINER` + `GRANT` donde toque, y `WMS009`.
- **Fecha:** 2026-07-08.

### [S-A] `perfil` aún no cuelga de `auth.users`
- **Qué:** `perfil.id` es un `uuid` autónomo con `default gen_random_uuid()`, no una
  FK a `auth.users(id)`.
- **Por qué:** `auth.users` y el flujo de alta (Edge Function) llegan en S-B.
- **Cuándo se resuelve:** S-B.
- **Fecha:** 2026-07-08.

### [S-A] `devolver` devuelve un retorno ampliado
- **Qué:** al poder generar varios movimientos (OK/roto/perdido), `devolver` añade al
  retorno estándar un campo `movimiento_ids` (array) además de `movimiento_id` (el
  primero). El resto de RPC siguen el retorno estándar de CONTRACTS §1.1 tal cual.
- **Por qué:** CONTRACTS §1.1 asume un único `movimiento_id`; la devolución por líneas
  necesita exponer todos.
- **Cuándo se resuelve:** confirmar el contrato con Persona B en S-D/S-E.
- **Fecha:** 2026-07-08.

### [S-A] Ficheros con secretos en la carpeta del repo (sin versionar)
- **Qué:** `.env.local.txt` y `Contraseñas y cosas.txt` (raíz) contienen la
  contraseña de la BD y **la `service_role` `sb_secret_...`**. Se han añadido al
  `.gitignore` (verificado con `git check-ignore`), pero siguen en disco.
- **Por qué:** los dejó el humano en S-0; no deben vivir en la carpeta del repo.
- **Cuándo se resuelve:** el humano debería moverlos fuera del repo y **rotar la
  `service_role`** si hubo riesgo de exposición. Ver resumen de la sesión.
- **Fecha:** 2026-07-08.

### [S-A] Nota de diseño: `movimiento.bucket_destino` es `text`, no enum
- **Qué:** `bucket_origen` usa el enum `bucket` (3 valores), pero `bucket_destino` es
  `text` con CHECK para admitir además `'baja'` (devolución por pérdida / baja).
- **Por qué:** el enum `bucket` se definió con exactamente 3 valores (S-A); `'baja'`
  no es un bucket operativo pero sí un destino de movimiento (DOMAIN §3.7/§5).
- **Cuándo se resuelve:** decisión estable; documentada por si se revisa el enum.
- **Fecha:** 2026-07-08.
