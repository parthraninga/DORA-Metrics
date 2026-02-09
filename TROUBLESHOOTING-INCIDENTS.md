# Troubleshooting "No Incidents" Issue

## Problem
You have workflow runs with `conclusion='failure'` in the database on dev/stage branches, but the UI shows "No incidents" when selecting those branches.

## Root Causes

### 1. **Hybrid Setup Detection** (FIXED ✅)
- **Problem**: When GitHub integration (org_id) is enabled, the system was calling an external API instead of using your Supabase data
- **Fix**: Modified `get_incidents.ts` to check Supabase first if data exists there, regardless of org_id
- **File**: `/pages/api/internal/team/[team_id]/get_incidents.ts`

### 2. **Branch Filtering in Workflow Filters** (FIXED ✅)
- **Problem**: Workflow filters were always using production branches, even when dev/stage was selected
- **Fix**: Updated `getWorkFlowFiltersAsPayloadForSingleTeam()` to use the correct branch based on branch_mode
- **File**: `/src/utils/filterUtils.ts`

### 3. **Missing Incidents in Database** (NEEDS CHECKING ❓)
- **Problem**: Incidents might not have been created from workflow_runs yet
- **Solution**: Run the SQL script to regenerate incidents

## Steps to Fix

### Step 1: Check if Incidents Exist
Use the diagnostic endpoint to see what's in your database:

```bash
curl "http://localhost:3000/api/debug/check-incidents?team_id=YOUR_TEAM_ID&branch=dev"
```

This will show you:
- How many workflow runs exist on dev branch
- How many incidents exist for those runs
- Which failed runs don't have incidents

### Step 2: Regenerate Incidents (if needed)
If incidents are missing, run the SQL script:

```bash
psql your_database < scripts/regenerate-incidents.sql
```

Or manually in your database client:
1. Open `/scripts/regenerate-incidents.sql`
2. Run the script in your Supabase SQL editor or PostgreSQL client

This will:
- Create incidents for all workflow runs with `conclusion='failure'`
- Link each incident to the next successful run (resolved_date)
- Show you a summary of incidents created

### Step 3: Verify Branch Configuration
Make sure your repos have the correct branch names configured:

```sql
SELECT 
  id,
  repo_name,
  dev_branch,
  stage_branch,
  prod_branch
FROM repos
WHERE id IN (
  SELECT repo_id FROM team_repos WHERE team_id = 'YOUR_TEAM_ID'
);
```

The branch names must EXACTLY match the `head_branch` values in your workflow_runs.

### Step 4: Test the Fix
1. Restart your Next.js server
2. Go to the DORA Metrics page
3. Select "Dev branch" from the dropdown
4. You should now see incidents for the failed dev branch runs

## How Incidents Are Created

Incidents are automatically created when you:
1. **Sync/Fetch data** from GitHub (via Sync page)
2. The `parseAndStoreFetchResponse()` function processes the data
3. It finds workflow runs with `conclusion='failure'`
4. Creates an incident for each failure
5. Links to the next successful run as `resolved_date`

## Verification Queries

### Check workflow runs on dev branch:
```sql
SELECT 
  wr.run_id,
  wr.name,
  wr.head_branch,
  wr.conclusion,
  wr.created_at,
  r.dev_branch
FROM workflow_runs wr
JOIN repos r ON r.id = wr.repo_id
WHERE wr.head_branch = r.dev_branch
  AND wr.conclusion = 'failure'
ORDER BY wr.created_at DESC
LIMIT 20;
```

### Check incidents for dev branch:
```sql
SELECT 
  i.id,
  i.workflow_run_id,
  wr.head_branch,
  wr.name,
  i.creation_date,
  i.resolved_date
FROM incidents i
JOIN workflow_runs wr ON wr.run_id = i.workflow_run_id AND wr.repo_id = i.repo_id
JOIN repos r ON r.id = i.repo_id
WHERE wr.head_branch = r.dev_branch
ORDER BY i.creation_date DESC
LIMIT 20;
```

### Count incidents by branch:
```sql
SELECT 
  wr.head_branch,
  COUNT(*) as incident_count,
  COUNT(i.resolved_date) as resolved_count
FROM incidents i
JOIN workflow_runs wr ON wr.run_id = i.workflow_run_id AND wr.repo_id = i.repo_id  
GROUP BY wr.head_branch
ORDER BY incident_count DESC;
```

## Expected Behavior After Fix

✅ **Dev Branch Selected**: Shows incidents from workflow runs on dev branch only
✅ **Stage Branch Selected**: Shows incidents from workflow runs on stage branch only
✅ **Production Branch Selected**: Shows incidents from workflow runs on production branch only

The system now:
1. Checks if you have data in Supabase (hybrid mode support)
2. Filters workflow runs by the selected branch
3. Shows only incidents from those filtered runs
4. Correctly matches branch names from your repo configuration

## Need More Help?

If incidents still don't show up after running the regenerate script:

1. Check the diagnostic endpoint output
2. Verify branch names match exactly (case-sensitive!)
3. Make sure you've synced data recently (Sync page)
4. Check browser console for errors
5. Check server logs for SQL errors
