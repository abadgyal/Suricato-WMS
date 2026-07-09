#!/usr/bin/env node
// ============================================================================
// Runner de tests de base de datos para el WMS (sprint S-A).
//
//   * Lee SUPABASE_DB_URL de .env.local (gitignored).
//   * Asegura la extensión pgTAP.
//   * Ejecuta cada fichero de supabase/tests/*.sql dentro de BEGIN...ROLLBACK,
//     imprime la salida TAP y detecta fallos ("not ok").
//   * Ejecuta un test de concurrencia real con DOS conexiones: dos
//     salida_evento simultáneas sobre un producto con disponible = 1; exactamente
//     una debe tener éxito y la otra fallar con WMS001, y disponible nunca queda
//     negativo.
//
//   Sale con código != 0 si algo falla.  Uso: node scripts/db-test.mjs
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TESTS_DIR = join(ROOT, 'supabase', 'tests');

// --- Cargar SUPABASE_DB_URL de .env.local -----------------------------------
function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  let raw;
  try {
    raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  } catch {
    throw new Error('No encuentro .env.local ni la variable SUPABASE_DB_URL. Copia .env.local.example a .env.local.');
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('No encuentro SUPABASE_DB_URL en .env.local');
}

const DB_URL = loadDbUrl();
const clientConfig = { connectionString: DB_URL, ssl: { rejectUnauthorized: false } };

// --- Utilidades -------------------------------------------------------------
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

// Extrae las líneas TAP (primera columna de cada fila) de un resultado
// multi-statement de node-postgres.
function tapLinesFrom(result) {
  const results = Array.isArray(result) ? result : [result];
  const lines = [];
  for (const r of results) {
    if (!r || !r.rows) continue;
    for (const row of r.rows) {
      const val = Object.values(row)[0];
      if (typeof val === 'string') lines.push(...val.split('\n'));
    }
  }
  return lines;
}

let totalTests = 0;
let totalFailures = 0;

async function runTapFile(client, file) {
  const sql = readFileSync(join(TESTS_DIR, file), 'utf8');
  console.log(DIM(`\n── ${file} ${'─'.repeat(Math.max(0, 60 - file.length))}`));
  await client.query('BEGIN');
  let lines;
  try {
    const res = await client.query(sql);
    lines = tapLinesFrom(res);
  } catch (err) {
    // Un error no capturado por pgTAP aborta el fichero completo.
    await client.query('ROLLBACK').catch(() => {});
    console.log(RED(`  ERROR ejecutando ${file}: ${err.message}`));
    totalFailures += 1;
    return;
  }
  await client.query('ROLLBACK');

  for (const line of lines) {
    if (/^ok /.test(line)) {
      totalTests += 1;
      console.log('  ' + GREEN(line));
    } else if (/^not ok /.test(line)) {
      totalTests += 1;
      totalFailures += 1;
      console.log('  ' + RED(line));
    } else if (line.trim().length) {
      console.log('  ' + DIM(line));
    }
  }
}

// --- Test de concurrencia ---------------------------------------------------
// Datos de prueba con marcador reconocible; se limpian al terminar.
const CC = {
  perfil: 'cc000000-0000-0000-0000-000000000001',
  categoria: 'cc000000-0000-0000-0000-0000000000c1',
  evento: 'cc000000-0000-0000-0000-0000000000e1',
  producto: 'cc000000-0000-0000-0000-0000000000a1',
};

async function setupConcurrency(client) {
  await client.query('BEGIN');
  // Respaldo en auth.users (FK perfil.id -> auth.users); solo `id` es NOT NULL.
  await client.query(
    `insert into auth.users (id) values ($1) on conflict (id) do nothing`, [CC.perfil]);
  await client.query(
    `insert into perfil (id, nombre, rol) values ($1, 'CC Worker', 'trabajador')
       on conflict (id) do nothing`, [CC.perfil]);
  await client.query(
    `insert into categoria (id, nombre, color) values ($1, 'ZZ_CONCURRENCIA', '#222')
       on conflict (id) do nothing`, [CC.categoria]);
  await client.query(
    `insert into evento (id, nombre, fecha_inicio, fecha_fin, estado, creado_por)
       values ($1, 'CC Evt', '2026-07-01', '2026-07-05', 'planificado', $2)
       on conflict (id) do nothing`, [CC.evento, CC.perfil]);
  await client.query(
    `insert into producto (id, nombre, categoria_id, disponible) values ($1, 'CC Prod', $2, 1)
       on conflict (id) do update set disponible = 1, en_evento = 0`,
    [CC.producto, CC.categoria]);
  await client.query('COMMIT');
}

async function cleanupConcurrency(client) {
  await client.query('BEGIN');
  // movimiento es inmutable por trigger: lo deshabilitamos sólo para limpiar.
  await client.query('alter table movimiento disable trigger trg_movimiento_no_delete');
  await client.query('delete from movimiento where producto_id = $1', [CC.producto]);
  await client.query('alter table movimiento enable trigger trg_movimiento_no_delete');
  await client.query('delete from reserva where producto_id = $1', [CC.producto]);
  await client.query('delete from producto where id = $1', [CC.producto]);
  await client.query('delete from evento where id = $1', [CC.evento]);
  await client.query('delete from categoria where id = $1', [CC.categoria]);
  await client.query('delete from perfil where id = $1', [CC.perfil]);
  await client.query('delete from auth.users where id = $1', [CC.perfil]);
  await client.query('COMMIT');
}

async function runConcurrencyTest() {
  console.log(DIM(`\n── concurrencia (2 conexiones) ${'─'.repeat(33)}`));
  const setup = new pg.Client(clientConfig);
  const a = new pg.Client(clientConfig);
  const b = new pg.Client(clientConfig);
  await setup.connect();
  await a.connect();
  await b.connect();

  try {
    await setupConcurrency(setup);

    // Las RPC usan auth.uid() como autor: fijamos el JWT (a nivel de sesión) al
    // trabajador de concurrencia en ambas conexiones.
    const claims = JSON.stringify({ sub: CC.perfil, role: 'authenticated' });
    await a.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
    await b.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);

    // Dos salidas simultáneas (autocommit) sobre el mismo producto (disponible=1).
    const fire = (c) =>
      c.query('select salida_evento($1, 1, $2)', [CC.producto, CC.evento]);
    const [ra, rb] = await Promise.allSettled([fire(a), fire(b)]);

    const outcomes = [ra, rb];
    const ok = outcomes.filter((o) => o.status === 'fulfilled').length;
    const failed = outcomes.filter((o) => o.status === 'rejected');
    const wms001 = failed.filter((o) => /WMS001/.test(o.reason?.message || '')).length;

    const { rows } = await setup.query('select disponible, en_evento from producto where id = $1', [CC.producto]);
    const disponible = rows[0]?.disponible;
    const enEvento = rows[0]?.en_evento;

    const checks = [
      [ok === 1, `exactamente una salida tiene éxito (éxitos = ${ok})`],
      [failed.length === 1, `exactamente una salida falla (fallos = ${failed.length})`],
      [wms001 === 1, `la que falla lo hace con WMS001 (WMS001 = ${wms001})`],
      [disponible === 0, `disponible final = 0, nunca negativo (disponible = ${disponible})`],
      [disponible >= 0, `disponible nunca es negativo (disponible = ${disponible})`],
      [enEvento === 1, `una unidad quedó en_evento (en_evento = ${enEvento})`],
    ];

    for (const [pass, desc] of checks) {
      totalTests += 1;
      if (pass) {
        console.log('  ' + GREEN(`ok - ${desc}`));
      } else {
        totalFailures += 1;
        console.log('  ' + RED(`not ok - ${desc}`));
      }
    }
    if (failed.length) {
      console.log('  ' + DIM(`# mensaje de error del fallo: ${failed[0].reason?.message?.split('\n')[0]}`));
    }
  } finally {
    await cleanupConcurrency(setup).catch((e) => console.log(RED(`  aviso: limpieza incompleta: ${e.message}`)));
    await a.end().catch(() => {});
    await b.end().catch(() => {});
    await setup.end().catch(() => {});
  }
}

// --- Tests de seguridad (RLS + roles) ---------------------------------------
// Simulan usuarios autenticados con `set local role` + `request.jwt.claims`.
// Usan los datos del seed (admin 11111111, trabajador 22222222, producto Shure).
// Todo va dentro de BEGIN...ROLLBACK: no muta la BD.
const SEC = {
  admin: '11111111-1111-1111-1111-111111111111',
  trab:  '22222222-2222-2222-2222-222222222222',
  prod:  'a0000002-0000-0000-0000-000000000002', // Shure SM58, disponible 3
};
const claimsOf = (sub) => JSON.stringify({ sub, role: 'authenticated' });

// Ejecuta `run` dentro de una transacción como cierto rol/JWT y siempre revierte.
// Devuelve { ok, err }.
async function inTxnAs(client, { claims, role }, run) {
  await client.query('BEGIN');
  try {
    if (claims) await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    if (role) await client.query(`set local role ${role}`);
    await run();
    await client.query('ROLLBACK');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, err };
  }
}

function recordSec(pass, desc, extra = '') {
  totalTests += 1;
  if (pass) {
    console.log('  ' + GREEN(`ok - ${desc}`));
  } else {
    totalFailures += 1;
    console.log('  ' + RED(`not ok - ${desc}`) + (extra ? DIM(`  # ${extra}`) : ''));
  }
}

async function runSecurityTests() {
  console.log(DIM(`\n── seguridad (RLS + roles) ${'─'.repeat(37)}`));
  const c = new pg.Client(clientConfig);
  await c.connect();
  try {
    // El principal real (dev: seed; prod: bootstrap) se descubre dinámicamente.
    const { rows } = await c.query('select id from perfil where es_principal limit 1');
    const principalId = rows[0]?.id ?? SEC.admin;

    // 1) Un trabajador NO puede ajustar ni dar_de_baja → WMS009.
    let r = await inTxnAs(c, { claims: claimsOf(SEC.trab), role: 'authenticated' },
      () => c.query(`select ajustar($1, 'disponible', 5, 'x')`, [SEC.prod]));
    recordSec(!r.ok && /WMS009/.test(r.err?.message), 'trabajador NO puede ajustar (WMS009)',
      r.ok ? 'no lanzó error' : r.err?.message?.split('\n')[0]);

    r = await inTxnAs(c, { claims: claimsOf(SEC.trab), role: 'authenticated' },
      () => c.query(`select dar_de_baja($1, 1, 'disponible', 'x')`, [SEC.prod]));
    recordSec(!r.ok && /WMS009/.test(r.err?.message), 'trabajador NO puede dar_de_baja (WMS009)',
      r.ok ? 'no lanzó error' : r.err?.message?.split('\n')[0]);

    // 2) Un admin SÍ puede ajustar y dar_de_baja.
    r = await inTxnAs(c, { claims: claimsOf(SEC.admin), role: 'authenticated' },
      () => c.query(`select ajustar($1, 'disponible', 5, 'recuento')`, [SEC.prod]));
    recordSec(r.ok, 'admin SÍ puede ajustar', r.err?.message?.split('\n')[0]);

    r = await inTxnAs(c, { claims: claimsOf(SEC.admin), role: 'authenticated' },
      () => c.query(`select dar_de_baja($1, 1, 'disponible', 'merma')`, [SEC.prod]));
    recordSec(r.ok, 'admin SÍ puede dar_de_baja', r.err?.message?.split('\n')[0]);

    // 3) Un trabajador NO puede INSERT directo en movimiento (sin privilegio).
    r = await inTxnAs(c, { claims: claimsOf(SEC.trab), role: 'authenticated' },
      () => c.query(
        `insert into movimiento (tipo, producto_id, usuario_id, unidades, bucket_destino)
         values ('entrada', $1, $2, 1, 'disponible')`, [SEC.prod, SEC.trab]));
    recordSec(!r.ok && /permission denied/i.test(r.err?.message), 'trabajador NO puede INSERT en movimiento',
      r.ok ? 'no lanzó error' : r.err?.message?.split('\n')[0]);

    // 4) Un trabajador NO puede UPDATE sobre los buckets de producto (sin privilegio de columna).
    r = await inTxnAs(c, { claims: claimsOf(SEC.trab), role: 'authenticated' },
      () => c.query(`update producto set disponible = disponible + 1 where id = $1`, [SEC.prod]));
    recordSec(!r.ok && /permission denied/i.test(r.err?.message), 'trabajador NO puede UPDATE buckets de producto',
      r.ok ? 'no lanzó error' : r.err?.message?.split('\n')[0]);

    // 5) Un trabajador SÍ puede editar metadatos de producto (no buckets).
    r = await inTxnAs(c, { claims: claimsOf(SEC.trab), role: 'authenticated' },
      () => c.query(`update producto set ubicacion = 'ZZ-sec' where id = $1`, [SEC.prod]));
    recordSec(r.ok, 'trabajador SÍ puede editar metadatos de producto', r.err?.message?.split('\n')[0]);

    // 6) Un no-autenticado (anon) no puede leer datos.
    r = await inTxnAs(c, { role: 'anon' },
      () => c.query('select count(*) from producto'));
    recordSec(!r.ok && /permission denied/i.test(r.err?.message), 'anon NO puede leer producto',
      r.ok ? 'leyó datos' : r.err?.message?.split('\n')[0]);

    // 7) Un autenticado SÍ puede leer inventario.
    r = await inTxnAs(c, { claims: claimsOf(SEC.trab), role: 'authenticated' },
      () => c.query('select count(*) from producto'));
    recordSec(r.ok, 'autenticado SÍ puede leer producto', r.err?.message?.split('\n')[0]);

    // 8) desactivar_usuario sobre un es_principal falla (invariante 8).
    r = await inTxnAs(c, { claims: claimsOf(SEC.admin), role: 'authenticated' },
      () => c.query('select desactivar_usuario($1)', [principalId]));
    recordSec(!r.ok && /WMS_PRINCIPAL/.test(r.err?.message), 'desactivar_usuario sobre el principal falla',
      r.ok ? 'no lanzó error' : r.err?.message?.split('\n')[0]);

    // 9) desactivar_usuario sobre un usuario normal, por un admin, funciona.
    r = await inTxnAs(c, { claims: claimsOf(SEC.admin), role: 'authenticated' },
      () => c.query('select desactivar_usuario($1)', [SEC.trab]));
    recordSec(r.ok, 'desactivar_usuario sobre un usuario normal funciona', r.err?.message?.split('\n')[0]);

    // 10) Un trabajador NO puede desactivar usuarios → WMS009.
    r = await inTxnAs(c, { claims: claimsOf(SEC.trab), role: 'authenticated' },
      () => c.query('select desactivar_usuario($1)', [SEC.trab]));
    recordSec(!r.ok && /WMS009/.test(r.err?.message), 'trabajador NO puede desactivar_usuario (WMS009)',
      r.ok ? 'no lanzó error' : r.err?.message?.split('\n')[0]);
  } finally {
    await c.end().catch(() => {});
  }
}

// --- Main -------------------------------------------------------------------
async function main() {
  const admin = new pg.Client(clientConfig);
  await admin.connect();
  await admin.query('create extension if not exists pgtap');

  const files = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await runTapFile(admin, file);
  }
  await admin.end();

  await runConcurrencyTest();

  await runSecurityTests();

  console.log('\n' + '='.repeat(64));
  if (totalFailures === 0) {
    console.log(GREEN(`✔ TODO VERDE — ${totalTests} tests, 0 fallos.`));
    process.exit(0);
  } else {
    console.log(RED(`x FALLOS — ${totalFailures} de ${totalTests} tests fallaron.`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(RED(`\nError fatal en el runner: ${err.stack || err.message}`));
  process.exit(1);
});
