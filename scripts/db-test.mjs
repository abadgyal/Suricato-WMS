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

    // Dos salidas simultáneas (autocommit) sobre el mismo producto (disponible=1).
    const fire = (c) =>
      c.query('select salida_evento($1, 1, $2, $3)', [CC.producto, CC.evento, CC.perfil]);
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
