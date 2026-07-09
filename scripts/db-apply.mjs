#!/usr/bin/env node
// ============================================================================
// Aplica uno o más ficheros SQL contra la BD remota (SUPABASE_DB_URL de
// .env.local). Uso: node scripts/db-apply.mjs supabase/migrations/XXXX.sql ...
//
// Complementa a `supabase db push`: sirve para aplicar migraciones nuevas al
// remoto desde este entorno (sin Docker). Las migraciones deben ser
// idempotentes, de modo que un `supabase db push` posterior que las registre en
// el historial pueda re-ejecutarlas sin efectos.
// ============================================================================
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('No encuentro SUPABASE_DB_URL en .env.local');
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node scripts/db-apply.mjs <fichero.sql> [...]');
  process.exit(1);
}

const client = new pg.Client({ connectionString: loadDbUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const f of files) {
    const sql = readFileSync(f.startsWith('/') || f[1] === ':' ? f : join(ROOT, f), 'utf8');
    process.stdout.write(`\n── aplicando ${f} …\n`);
    await client.query('begin');
    await client.query(sql);
    // Registrar en el historial de migraciones si el fichero es una migración
    // (nombre NNNNNNNNNNNNNN_descripcion.sql). Así un `supabase db push`
    // posterior la considera aplicada y no la re-ejecuta.
    const base = f.replace(/\\/g, '/').split('/').pop();
    const m = base.match(/^(\d{14})_(.+)\.sql$/);
    if (m) {
      await client.query(
        `insert into supabase_migrations.schema_migrations (version, name)
         values ($1, $2) on conflict (version) do nothing`,
        [m[1], m[2]],
      );
    }
    await client.query('commit');
    console.log(`   ✔ ${f} aplicado`);
  }
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error(`   ✖ error: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
