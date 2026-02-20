#!/usr/bin/env node
/**
 * Backfill script: re-parse raw_response from existing fetch_data rows
 * and populate pull_requests, incidents, workflow_runs tables.
 *
 * Safe to re-run — upserts on id, skips fetch_data rows that already
 * have child records.
 *
 * Usage:
 *   export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
 *   node scripts/backfill-fetch-data.mjs
 *
 *   # Dry-run (just show what would be processed, no writes):
 *   DRY_RUN=true node scripts/backfill-fetch-data.mjs
 *
 *   # Process a single fetch_data row by id:
 *   node scripts/backfill-fetch-data.mjs <fetch-data-id>
 */

import { createClient } from '@supabase/supabase-js';
import { createHash }   from 'crypto';

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN                   = process.env.DRY_RUN === 'true';
const FORCE                     = process.env.FORCE === 'true'; // re-process even if child records exist
const TARGET_ID                 = process.argv[2] ?? null; // optional: single fetch_data id

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateDeterministicUUID(namespace, name) {
  const hash = createHash('sha1');
  hash.update(namespace + name);
  const hex = hash.digest('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    '5' + hex.substring(13, 16),
    ((parseInt(hex.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hex.substring(18, 20),
    hex.substring(20, 32),
  ].join('-');
}

const isUUID = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
const toTs   = s => s == null ? null : typeof s === 'string' ? s : typeof s === 'number' ? new Date(s).toISOString() : null;
const toInt  = v => { if (v == null) return null; const n = typeof v === 'number' ? v : parseInt(String(v), 10); return Number.isFinite(n) ? n : null; };
const toAuthor = a => {
  if (a == null) return null;
  if (typeof a === 'string') return a;
  if (typeof a === 'object') return a.username ?? a.login ?? null;
  return null;
};

// ── Process one fetch_data row ────────────────────────────────────────────────
async function processRow(row) {
  const { id: fetchDataId, repo_id: repoId, fetched_at, raw_response } = row;
  const rr    = raw_response ?? {};
  const root  = rr.data ?? rr;
  const repos = Array.isArray(root.repos) ? root.repos : [];

  if (repos.length === 0) {
    console.log(`  ⚠️  No repos[] in raw_response — skipping`);
    return { prs: 0, incidents: 0, wrs: 0, skipped: true };
  }

  let totalPRs = 0, totalIncidents = 0, totalWRs = 0;

  for (const repoData of repos) {
    if (repoData.error) {
      console.log(`  ⚠️  repos entry has error field — skipping`);
      continue;
    }

    // ── Pull Requests ──────────────────────────────────────────────────────
    // Use repos[].pull_requests[] (have UUID ids). deployments[].related_prs[]
    // are the same objects — skip to avoid duplicates.
    const pullRequests = Array.isArray(repoData.pull_requests) ? repoData.pull_requests : [];
    const validPRs = [];
    for (const pr of pullRequests) {
      if (!pr.id || !isUUID(pr.id)) {
        console.log(`  ⚠️  PR missing/invalid id (${pr.id}), pr_no=${pr.number} — skipping`);
        continue;
      }
      validPRs.push({
        id:                   pr.id,
        repo_id:              repoId,
        fetch_data_id:        fetchDataId,
        pr_no:                pr.number?.toString() ?? pr.pr_no?.toString() ?? null,
        title:                pr.title ?? null,
        author:               toAuthor(pr.author),
        first_commit_to_open: pr.first_commit_to_open ?? null,
        cycle_time:           pr.cycle_time ?? null,
        created_at:           toTs(pr.created_at),
        updated_at:           toTs(pr.updated_at),
        state:                pr.state ?? null,
        base_branch:          typeof pr.base_branch === 'string' ? pr.base_branch : null,
        head_branch:          typeof pr.head_branch === 'string' ? pr.head_branch : null,
        commits:              toInt(pr.commits),
        additions:            toInt(pr.additions),
        deletions:            toInt(pr.deletions),
        comments:             toInt(pr.comments),
      });
    }

    if (validPRs.length > 0) {
      if (!DRY_RUN) {
        const { error } = await supabase
          .from('pull_requests')
          .upsert(validPRs, { onConflict: 'id', ignoreDuplicates: true });
        if (error && !error.message.includes('duplicate key')) console.error(`  ❌  PR upsert error: ${error.message}`);
        else totalPRs += validPRs.length;
      } else {
        totalPRs += validPRs.length;
      }
    }

    // ── Incidents ──────────────────────────────────────────────────────────
    // repos[].incidents[] — ids are "None", derive from key field.
    const incidentsList = Array.isArray(repoData.incidents) ? repoData.incidents : [];
    const validIncidents = [];
    for (const inc of incidentsList) {
      let incId = isUUID(inc.id) ? inc.id : null;
      if (!incId) {
        if (!inc.key) {
          console.log(`  ⚠️  Incident has no valid id or key — skipping`);
          continue;
        }
        incId = generateDeterministicUUID('incident', inc.key);
      }

      let workflowRunId = null;
      if (typeof inc.key === 'string' && inc.key.startsWith('workflow-')) {
        const n = inc.key.replace('workflow-', '');
        if (n && !isNaN(n)) workflowRunId = parseInt(n, 10);
      }

      // incidents table columns: id, repo_id, fetch_data_id, pull_request_id,
      // workflow_run_id, created_at, pr_no, creation_date, resolved_date
      validIncidents.push({
        id:              incId,
        repo_id:         repoId,
        fetch_data_id:   fetchDataId,
        pull_request_id: isUUID(inc.pull_request_id) ? inc.pull_request_id : null,
        workflow_run_id: workflowRunId,
        pr_no:           inc.incident_number?.toString() ?? null,
        creation_date:   toTs(inc.creation_date),
        resolved_date:   toTs(inc.resolved_date),
        created_at:      toTs(inc.creation_date),
      });
    }

    if (validIncidents.length > 0) {
      if (!DRY_RUN) {
        const { error } = await supabase
          .from('incidents')
          .upsert(validIncidents, { onConflict: 'id', ignoreDuplicates: false });
        if (error) console.error(`  ❌  Incidents upsert error: ${error.message}`);
        else totalIncidents += validIncidents.length;
      } else {
        totalIncidents += validIncidents.length;
      }
    }

    // ── Workflow Runs ──────────────────────────────────────────────────────
    // repos[].workflow_runs[] — ids are numeric, generate deterministic UUID.
    const workflowRuns = Array.isArray(repoData.workflow_runs) ? repoData.workflow_runs : [];
    const validWRs = [];
    for (const wr of workflowRuns) {
      const rawId = wr.id ?? wr.run_id;
      if (rawId == null) continue;
      const rawIdStr = String(rawId);
      const uuidId   = isUUID(rawIdStr) ? rawIdStr : generateDeterministicUUID('workflow_run', rawIdStr);
      // workflow_runs table columns: id, repo_id, fetch_data_id, run_id, name,
      // head_branch, status, conclusion, created_at, updated_at, html_url, actor, workflow_id
      validWRs.push({
        id:            uuidId,
        repo_id:       repoId,
        fetch_data_id: fetchDataId,
        run_id:        rawIdStr,
        name:          wr.name ?? wr.workflow_name ?? null,
        head_branch:   wr.head_branch ?? null,
        status:        wr.status ?? null,
        conclusion:    wr.conclusion ?? null,
        created_at:    toTs(wr.created_at),
        updated_at:    toTs(wr.updated_at),
        html_url:      wr.html_url ?? wr.url ?? null,
        actor:         toAuthor(wr.actor),
        workflow_id:   wr.workflow_id?.toString() ?? null,
      });
    }

    if (validWRs.length > 0) {
      if (!DRY_RUN) {
        const { error } = await supabase
          .from('workflow_runs')
          .upsert(validWRs, { onConflict: 'id', ignoreDuplicates: false });
        if (error) console.error(`  ❌  Workflow runs upsert error: ${error.message}`);
        else totalWRs += validWRs.length;
      } else {
        totalWRs += validWRs.length;
      }
    }
  }

  return { prs: totalPRs, incidents: totalIncidents, wrs: totalWRs, skipped: false };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀  DORA Backfill — re-parsing fetch_data.raw_response into child tables`);
  if (DRY_RUN) console.log('🔍  DRY RUN — no writes will be made\n');
  if (FORCE)   console.log('⚡  FORCE mode — all rows will be reprocessed (upserts are safe)\n');

  // Fetch all fetch_data rows (or one specific row)
  let query = supabase
    .from('fetch_data')
    .select('id, repo_id, fetched_at, raw_response')
    .eq('state', 'success')
    .order('fetched_at', { ascending: true });

  if (TARGET_ID) {
    query = query.eq('id', TARGET_ID);
    console.log(`🎯  Targeting single fetch_data id: ${TARGET_ID}\n`);
  }

  const { data: rows, error } = await query;
  if (error) { console.error('❌  Failed to fetch fetch_data:', error.message); process.exit(1); }

  console.log(`📋  Found ${rows.length} fetch_data rows to process\n`);

  const summary = { total: rows.length, processed: 0, skipped: 0, prs: 0, incidents: 0, wrs: 0 };

  for (const row of rows) {
    console.log(`\n[${row.fetched_at}] fetch_data: ${row.id}`);
    console.log(`   repo_id: ${row.repo_id}`);

    // Check if this fetch_data_id already has child records (skip re-processing)
    if (!TARGET_ID && !FORCE) {
      const { count } = await supabase
        .from('pull_requests')
        .select('id', { count: 'exact', head: true })
        .eq('fetch_data_id', row.id);

      if (count > 0) {
        console.log(`   ✅  Already has ${count} pull_requests — skipping (set FORCE=true to reprocess)`);
        summary.skipped++;
        continue;
      }
    }

    const result = await processRow(row);

    if (result.skipped) {
      summary.skipped++;
    } else {
      summary.processed++;
      summary.prs       += result.prs;
      summary.incidents += result.incidents;
      summary.wrs       += result.wrs;
      console.log(`   ✅  PRs: ${result.prs}, Incidents: ${result.incidents}, Workflow Runs: ${result.wrs}`);
    }
  }

  console.log('\n' + '═'.repeat(55));
  console.log('📊  BACKFILL SUMMARY');
  console.log('═'.repeat(55));
  console.log(`   Total fetch_data rows : ${summary.total}`);
  console.log(`   Processed             : ${summary.processed}`);
  console.log(`   Skipped (already done): ${summary.skipped}`);
  console.log(`   Pull Requests upserted: ${summary.prs}`);
  console.log(`   Incidents upserted    : ${summary.incidents}`);
  console.log(`   Workflow Runs upserted: ${summary.wrs}`);
  console.log('═'.repeat(55));

  if (DRY_RUN) console.log('\n🔍  DRY RUN — nothing was written. Remove DRY_RUN=true to apply.\n');
  else          console.log('\n✅  Backfill complete!\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
