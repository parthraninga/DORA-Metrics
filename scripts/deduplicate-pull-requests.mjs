/**
 * Deduplicate pull_requests table.
 *
 * Strategy:
 *   - Group rows by (repo_id, pr_no)
 *   - For each group with > 1 row, keep the row with the LATEST updated_at
 *     (most recent data) and delete the rest.
 *
 * Run:
 *   export $(cat .env | grep -v '^#' | xargs) && node scripts/deduplicate-pull-requests.mjs
 *
 * Add --dry-run to only see what would be deleted without actually deleting.
 */

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAllPullRequests() {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let page = 0;

  console.log('Fetching all pull_requests rows...');
  while (true) {
    const { data, error } = await supabase
      .from('pull_requests')
      .select('id, repo_id, pr_no, updated_at, created_at, title')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    console.log(`  Fetched ${allRows.length} rows so far...`);

    if (data.length < PAGE_SIZE) break;
    page++;
  }

  return allRows;
}

async function main() {
  const rows = await fetchAllPullRequests();
  console.log(`\nTotal rows fetched: ${rows.length}`);

  // Group by repo_id + pr_no
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.repo_id}::${row.pr_no}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }

  // Find groups with duplicates
  const duplicateGroups = [];
  for (const [key, groupRows] of groups.entries()) {
    if (groupRows.length > 1) {
      duplicateGroups.push({ key, rows: groupRows });
    }
  }

  if (duplicateGroups.length === 0) {
    console.log('\n✅ No duplicates found! The table is already clean.');
    return;
  }

  const totalDuplicate = duplicateGroups.reduce((sum, g) => sum + g.rows.length - 1, 0);
  console.log(`\nFound ${duplicateGroups.length} PR keys with duplicates`);
  console.log(`Will delete ${totalDuplicate} duplicate rows (keeping 1 per key)`);

  // Show a sample of what will be deleted
  console.log('\nSample duplicates (first 5):');
  for (const group of duplicateGroups.slice(0, 5)) {
    console.log(`  PR #${group.rows[0].pr_no} in repo ${group.rows[0].repo_id.slice(0,8)}... — ${group.rows.length} copies`);
    for (const r of group.rows) {
      console.log(`    id=${r.id.slice(0,8)}... updated_at=${r.updated_at} title="${r.title?.slice(0, 40)}"`);
    }
  }

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no rows deleted. Remove --dry-run to apply.');
    return;
  }

  // Collect IDs to delete (all except newest updated_at per group)
  const idsToDelete = [];
  for (const group of duplicateGroups) {
    // Sort by updated_at descending — keep first (newest), delete the rest
    const sorted = group.rows.sort((a, b) => {
      const da = new Date(a.updated_at || a.created_at || 0).getTime();
      const db = new Date(b.updated_at || b.created_at || 0).getTime();
      return db - da; // newest first
    });
    // Delete all except the first (newest)
    for (const row of sorted.slice(1)) {
      idsToDelete.push(row.id);
    }
  }

  console.log(`\nDeleting ${idsToDelete.length} rows...`);

  // Delete in batches of 500 to avoid request size limits
  const BATCH_SIZE = 500;
  let deletedCount = 0;

  for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
    const batch = idsToDelete.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('pull_requests')
      .delete()
      .in('id', batch);

    if (error) {
      console.error(`Error deleting batch at index ${i}:`, error.message);
      process.exit(1);
    }

    deletedCount += batch.length;
    console.log(`  Deleted ${deletedCount} / ${idsToDelete.length}...`);
  }

  console.log(`\n✅ Done! Deleted ${deletedCount} duplicate rows.`);
  console.log(`   Kept ${rows.length - deletedCount} unique rows.`);

  // Verify
  const { count, error: countError } = await supabase
    .from('pull_requests')
    .select('*', { count: 'exact', head: true });

  if (!countError) {
    console.log(`   Table now has ${count} rows total.`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
