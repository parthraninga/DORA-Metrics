#!/usr/bin/env node
/**
 * Run the UNIQUE-constraint migration against the Supabase PostgreSQL database.
 *
 * Requires one additional credential — the database password from Supabase:
 *   Dashboard → Project Settings → Database → "Database password"
 *
 * Add it to .env:
 *   SUPABASE_DB_PASSWORD=your-db-password
 *
 * Then run:
 *   export $(cat .env | grep -v '^#' | xargs) && node scripts/run-migration.mjs
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Build connection config ────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL ?? '';
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!projectRef) {
  console.error('❌ SUPABASE_URL is missing from .env');
  process.exit(1);
}

if (!dbPassword) {
  console.error('❌ SUPABASE_DB_PASSWORD is missing from .env');
  console.error('');
  console.error('   Get it from: Supabase Dashboard → Project Settings → Database → Database password');
  console.error('   Then add this line to your .env:');
  console.error('   SUPABASE_DB_PASSWORD=your-db-password-here');
  console.error('');
  process.exit(1);
}

const client = new Client({
  host: `db.${projectRef}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: dbPassword,
  ssl: { rejectUnauthorized: false },
});

// ── Run migration ─────────────────────────────────────────────────────────────
const migrationPath = path.join(__dirname, '..', 'migrations', 'add_unique_constraints.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

async function runMigration() {
  console.log('🔌 Connecting to Supabase PostgreSQL...');
  await client.connect();
  console.log('✅ Connected\n');

  // Check if constraints already exist
  const { rows: existing } = await client.query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE constraint_type = 'UNIQUE'
      AND constraint_name IN (
        'workflow_runs_repo_id_run_id_key',
        'pull_requests_repo_id_pr_no_key',
        'incidents_repo_id_workflow_run_id_key'
      );
  `);

  const existingNames = new Set(existing.map(r => r.constraint_name));
  const allExist =
    existingNames.has('workflow_runs_repo_id_run_id_key') &&
    existingNames.has('pull_requests_repo_id_pr_no_key') &&
    existingNames.has('incidents_repo_id_workflow_run_id_key');

  if (allExist) {
    console.log('ℹ️  All UNIQUE constraints already exist. Re-running to clean duplicate data...\n');
  }

  console.log('🚀 Applying migration: migrations/add_unique_constraints.sql');
  console.log('─'.repeat(60));

  // Split on semicolons to execute statements individually (skip comments/blanks)
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let passed = 0;
  let failed = 0;

  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    process.stdout.write(`  ➜ ${preview}...`);
    try {
      const result = await client.query(stmt);
      // For SELECT statements (verification query), print results
      if (result.rows && result.rows.length && result.fields?.length) {
        console.log('');
        console.log('\n📊 Verification:');
        console.table(result.rows);
      } else {
        console.log(' ✅');
      }
      passed += 1;
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).replace(/\n/g, ' ');
      // Constraint already exists = idempotent, not a real error
      if (msg.includes('already exists')) {
        console.log(` ⚠️  already exists (skipped)`);
        passed += 1;
      } else {
        console.log(` ❌ ${msg}`);
        failed += 1;
      }
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 Migration complete! Your database now has:');
    console.log('   • UNIQUE (repo_id, run_id)        on workflow_runs');
    console.log('   • UNIQUE (repo_id, pr_no)          on pull_requests');
    console.log('   • UNIQUE (repo_id, workflow_run_id) on incidents');
    console.log('   • actor column changed from jsonb → text on workflow_runs');
    console.log('\n   Future syncs will UPSERT (update-or-skip) instead of inserting new rows.');
    console.log('   Duplicates are now impossible at the database level. ✅\n');
  }

  await client.end();
}

runMigration().catch(async (err) => {
  console.error('\n❌ Migration failed:', err.message);
  await client.end().catch(() => {});
  process.exit(1);
});
