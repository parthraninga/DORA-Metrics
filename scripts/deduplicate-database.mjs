#!/usr/bin/env node
/**
 * Deduplicate database records across workflow_runs, incidents, and pull_requests tables.
 * 
 * Strategy:
 *   - For workflow_runs: Group by (repo_id, run_id), keep the row with LATEST updated_at
 *   - For incidents: Group by (repo_id, workflow_run_id), keep the row with LATEST updated_at
 *   - For pull_requests: Group by (repo_id, pr_no), keep the row with LATEST updated_at
 *   - Delete all other duplicates
 *
 * Run:
 *   export $(cat .env | grep -v '^#' | xargs) && node scripts/deduplicate-database.mjs
 *
 *   # Dry-run (just show what would be deleted without actually deleting):
 *   DRY_RUN=true node scripts/deduplicate-database.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(`\n🔍 DEDUPLICATION SCRIPT`);
console.log('='.repeat(60));
if (DRY_RUN) console.log('🔍  DRY RUN — no records will be deleted\n');
else console.log('⚠️  DESTRUCTIVE MODE — duplicates will be deleted\n');

// ── Deduplicate workflow_runs ────────────────────────────────────────────────
async function deduplicateWorkflowRuns() {
  console.log('\n📊 Deduplicating workflow_runs table...');
  
  const { data: allRuns, error } = await supabase
    .from('workflow_runs')
    .select('id, repo_id, run_id, updated_at, created_at')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching workflow_runs:', error.message);
    return 0;
  }

  // Group by (repo_id, run_id)
  const grouped = new Map();
  for (const run of allRuns || []) {
    const key = `${run.repo_id}:${run.run_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(run);
  }

  // Find duplicates to delete (keep the first/latest, delete the rest)
  const toDelete = [];
  let duplicateCount = 0;
  
  for (const [key, runs] of grouped) {
    if (runs.length > 1) {
      duplicateCount += runs.length - 1;
      console.log(`   Found ${runs.length} duplicates for ${key}`);
      // Keep the first (latest updated_at), delete the rest
      for (let i = 1; i < runs.length; i++) {
        toDelete.push(runs[i].id);
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('   ✅ No duplicates found in workflow_runs');
    return 0;
  }

  console.log(`   🗑️  Found ${toDelete.length} duplicate records to remove`);

  if (!DRY_RUN) {
    const { error: deleteError } = await supabase
      .from('workflow_runs')
      .delete()
      .in('id', toDelete);

    if (deleteError) {
      console.error(`   ❌ Error deleting duplicates: ${deleteError.message}`);
      return 0;
    } else {
      console.log(`   ✅ Deleted ${toDelete.length} duplicate workflow_runs`);
      return toDelete.length;
    }
  } else {
    console.log(`   ✅ [DRY RUN] Would delete ${toDelete.length} duplicate workflow_runs`);
    return toDelete.length;
  }
}

// ── Deduplicate incidents ────────────────────────────────────────────────────
async function deduplicateIncidents() {
  console.log('\n🚨 Deduplicating incidents table...');
  
  const { data: allIncidents, error } = await supabase
    .from('incidents')
    .select('id, repo_id, workflow_run_id, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching incidents:', error.message);
    return 0;
  }

  // Group by (repo_id, workflow_run_id)
  const grouped = new Map();
  for (const inc of allIncidents || []) {
    const key = `${inc.repo_id}:${inc.workflow_run_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(inc);
  }

  // Find duplicates to delete
  const toDelete = [];
  
  for (const [key, incidents] of grouped) {
    if (incidents.length > 1) {
      console.log(`   Found ${incidents.length} duplicates for ${key}`);
      // Keep the first (latest created_at), delete the rest
      for (let i = 1; i < incidents.length; i++) {
        toDelete.push(incidents[i].id);
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('   ✅ No duplicates found in incidents');
    return 0;
  }

  console.log(`   🗑️  Found ${toDelete.length} duplicate records to remove`);

  if (!DRY_RUN) {
    const { error: deleteError } = await supabase
      .from('incidents')
      .delete()
      .in('id', toDelete);

    if (deleteError) {
      console.error(`   ❌ Error deleting duplicates: ${deleteError.message}`);
      return 0;
    } else {
      console.log(`   ✅ Deleted ${toDelete.length} duplicate incidents`);
      return toDelete.length;
    }
  } else {
    console.log(`   ✅ [DRY RUN] Would delete ${toDelete.length} duplicate incidents`);
    return toDelete.length;
  }
}

// ── Deduplicate pull_requests ────────────────────────────────────────────────
async function deduplicatePullRequests() {
  console.log('\n📝 Deduplicating pull_requests table...');
  
  const { data: allPRs, error } = await supabase
    .from('pull_requests')
    .select('id, repo_id, pr_no, updated_at, created_at')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching pull_requests:', error.message);
    return 0;
  }

  // Group by (repo_id, pr_no)
  const grouped = new Map();
  for (const pr of allPRs || []) {
    const key = `${pr.repo_id}:${pr.pr_no}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(pr);
  }

  // Find duplicates to delete
  const toDelete = [];
  
  for (const [key, prs] of grouped) {
    if (prs.length > 1) {
      console.log(`   Found ${prs.length} duplicates for ${key}`);
      // Keep the first (latest updated_at), delete the rest
      for (let i = 1; i < prs.length; i++) {
        toDelete.push(prs[i].id);
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('   ✅ No duplicates found in pull_requests');
    return 0;
  }

  console.log(`   🗑️  Found ${toDelete.length} duplicate records to remove`);

  if (!DRY_RUN) {
    const { error: deleteError } = await supabase
      .from('pull_requests')
      .delete()
      .in('id', toDelete);

    if (deleteError) {
      console.error(`   ❌ Error deleting duplicates: ${deleteError.message}`);
      return 0;
    } else {
      console.log(`   ✅ Deleted ${toDelete.length} duplicate pull_requests`);
      return toDelete.length;
    }
  } else {
    console.log(`   ✅ [DRY RUN] Would delete ${toDelete.length} duplicate pull_requests`);
    return toDelete.length;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const wrDeleted = await deduplicateWorkflowRuns();
    const incDeleted = await deduplicateIncidents();
    const prDeleted = await deduplicatePullRequests();

    console.log('\n' + '='.repeat(60));
    console.log('📊 DEDUPLICATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Workflow Runs: ${wrDeleted} deleted`);
    console.log(`✅ Incidents: ${incDeleted} deleted`);
    console.log(`✅ Pull Requests: ${prDeleted} deleted`);
    console.log(`✅ Total: ${wrDeleted + incDeleted + prDeleted} records removed`);
    console.log('='.repeat(60));
    console.log('✅ Deduplication completed!\n');
  } catch (err) {
    console.error('\n❌ Fatal error:');
    console.error(err);
    process.exit(1);
  }
}

main();
