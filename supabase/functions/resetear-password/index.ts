// ============================================================================
// Edge Function · resetear-password
//
// El admin restablece la contraseña de un usuario. No hay recuperación por email
// (decisión de producto): el admin fija la contraseña y se la comunica a la
// persona por un canal aparte. La app no envía correos.
//
// Flujo (mismas guardas que `crear-usuario`):
//   1. Verifica que el llamante está autenticado y es admin activo (lee su JWT y
//      consulta su fila en `perfil`). Si no ⇒ 401 / 403.
//   2. Resuelve el usuario objetivo por `id` (preferente) o por `email`, y exige
//      que tenga fila en `perfil`: solo se opera sobre usuarios de la app.
//   3. Con la service_role (inyectada por Supabase como SUPABASE_SERVICE_ROLE_KEY)
//      aplica la nueva contraseña vía la API de administración de Auth.
//
// Guarda extra sobre el admin principal: su contraseña solo puede cambiarla él
// mismo. Sin esto, cualquier admin secundario podría apropiarse de la cuenta
// principal, que SPEC §15 declara protegida.
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

interface Body {
  id?: string;
  email?: string;
  password?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Longitud mínima de contraseña; la misma que exige el alta en `crear-usuario`. */
const MIN_PASSWORD = 6;

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

  const id = body.id?.trim();
  const email = body.email?.trim();
  const password = body.password ?? "";

  if (!id && !email) return json({ error: "id o email es obligatorio" }, 400);
  if (!password || password.length < MIN_PASSWORD) {
    return json(
      { error: `password debe tener al menos ${MIN_PASSWORD} caracteres` },
      400,
    );
  }

  // --- 4) Resolver el usuario objetivo -------------------------------------
  let objetivoId: string | undefined = id;

  if (!objetivoId && email) {
    // No hay getUserByEmail en la API de administración: hay que paginar. El
    // censo de esta app es de decenas de usuarios, así que el coste es trivial;
    // aun así se acota para no barrer indefinidamente si algún día crece.
    const PER_PAGE = 200;
    const MAX_PAGES = 10;
    const objetivoEmail = email.toLowerCase();
    for (let page = 1; page <= MAX_PAGES && !objetivoId; page++) {
      const { data: lista, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage: PER_PAGE,
      });
      if (listErr) return json({ error: listErr.message }, 500);
      const usuarios = lista?.users ?? [];
      objetivoId = usuarios.find((u) => u.email?.toLowerCase() === objetivoEmail)?.id;
      if (usuarios.length < PER_PAGE) break; // última página
    }
    if (!objetivoId) {
      return json({ error: "No existe un usuario con ese email" }, 404);
    }
  }

  // El usuario objetivo tiene que ser un usuario de la app: si no tiene perfil,
  // no se toca (misma frontera que el alta, que siempre crea perfil).
  const { data: perfilObjetivo, error: objetivoErr } = await admin
    .from("perfil")
    .select("id, nombre, es_principal")
    .eq("id", objetivoId!)
    .single();
  if (objetivoErr || !perfilObjetivo) {
    return json({ error: "No existe el usuario objetivo" }, 404);
  }

  // Guarda del admin principal: solo él puede cambiar su propia contraseña.
  if (perfilObjetivo.es_principal && perfilObjetivo.id !== caller.id) {
    return json(
      { error: "Solo el admin principal puede cambiar su propia contraseña" },
      403,
    );
  }

  // --- 5) Aplicar la nueva contraseña --------------------------------------
  const { error: updateErr } = await admin.auth.admin.updateUserById(
    perfilObjetivo.id,
    { password },
  );
  if (updateErr) {
    return json({ error: updateErr.message ?? "No se pudo cambiar la contraseña" }, 400);
  }

  return json({ id: perfilObjetivo.id, nombre: perfilObjetivo.nombre }, 200);
});
