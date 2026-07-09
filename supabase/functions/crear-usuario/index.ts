// ============================================================================
// Edge Function · crear-usuario  (S-B, Opción A: alta por el admin)
//
// Flujo:
//   1. Verifica que el llamante está autenticado y es admin activo (lee su JWT y
//      consulta su fila en `perfil`). Si no ⇒ 401 / 403.
//   2. Con la service_role (inyectada por Supabase como SUPABASE_SERVICE_ROLE_KEY)
//      crea el usuario en Auth y su fila en `perfil` (activo=true, es_principal=
//      false) de forma atómica: si falla la inserción del perfil, borra el auth
//      user recién creado (compensación) para no dejar cuentas huérfanas.
//
// No hay auto-registro público: este es el único camino de alta (salvo el
// bootstrap del primer admin, ver docs/BOOTSTRAP.md).
//
// Secretos: NUNCA se hardcodea la service_role; se lee de la variable de entorno
// que Supabase inyecta en la función.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Rol = "admin" | "trabajador";

interface Body {
  email?: string;
  nombre?: string;
  username?: string;
  rol?: Rol;
  password?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return json({ error: "Configuración del servidor incompleta" }, 500);
  }

  // --- 1) Autenticación del llamante ---------------------------------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta el token de autenticación" }, 401);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: callerErr } =
    await callerClient.auth.getUser();
  if (callerErr || !caller) return json({ error: "No autenticado" }, 401);

  // --- 2) Comprobación de rol (admin activo) via service_role --------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: perfilLlamante, error: perfilErr } = await admin
    .from("perfil")
    .select("rol, activo")
    .eq("id", caller.id)
    .single();
  if (perfilErr || !perfilLlamante) {
    return json({ error: "El llamante no tiene perfil" }, 403);
  }
  if (perfilLlamante.rol !== "admin" || perfilLlamante.activo !== true) {
    return json({ error: "Se requiere un admin activo" }, 403);
  }

  // --- 3) Validación de la entrada -----------------------------------------
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const email = body.email?.trim();
  const nombre = body.nombre?.trim();
  const username = body.username?.trim() || null;
  const rol: Rol = body.rol === "admin" ? "admin" : "trabajador";
  const password = body.password ?? "";

  if (!email) return json({ error: "email es obligatorio" }, 400);
  if (!nombre) return json({ error: "nombre es obligatorio" }, 400);
  if (body.rol && body.rol !== "admin" && body.rol !== "trabajador") {
    return json({ error: "rol debe ser admin o trabajador" }, 400);
  }
  if (!password || password.length < 6) {
    return json({ error: "password debe tener al menos 6 caracteres" }, 400);
  }

  // --- 4) Crear el usuario en Auth -----------------------------------------
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, username },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "No se pudo crear el usuario";
    // Email ya existente u otros conflictos → 409.
    const status = /already|exists|registered/i.test(msg) ? 409 : 400;
    return json({ error: msg }, status);
  }

  const nuevoId = created.user.id;

  // --- 5) Insertar la fila de perfil (atómico con compensación) ------------
  const { error: insertErr } = await admin.from("perfil").insert({
    id: nuevoId,
    nombre,
    rol,
    activo: true,
    es_principal: false,
  });
  if (insertErr) {
    // Compensa: borra el auth user para no dejar cuenta huérfana sin perfil.
    await admin.auth.admin.deleteUser(nuevoId);
    return json(
      { error: "No se pudo crear el perfil; alta revertida", detail: insertErr.message },
      500,
    );
  }

  return json({ id: nuevoId, email, nombre, rol, username }, 201);
});
