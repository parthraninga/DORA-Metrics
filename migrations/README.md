# Database Migration Guide

## Adding Missing Fields to DORA Metrics Tables

The ingestion script now captures **all available fields** from your JSON responses, but your database schema is missing columns for some important fields.

### What's Currently Missing:

#### Pull Requests (13 additional fields):
- ❌ `url` - Link to GitHub PR
- ❌ `state_changed_at` - When PR state last changed  
- ❌ `provider` - Source system (github, gitlab, etc.)
- ❌ `reviewers` - Who reviewed the PR
- ❌ Time metrics: `lead_time`, `merge_time`, `deploy_time`, `first_response_time`, `rework_time`, `merge_to_deploy`

#### Incidents (7 additional fields):
- ❌ `title` - Incident title/description
- ❌ `status` - Current status (RESOLVED, OPEN, etc.)
- ❌ `incident_type` - Type (WORKFLOW_FAILURE, etc.)
- ❌ `url` - Link to incident
- ❌ `provider` - Provider (GITHUB_ACTIONS, PAGERDUTY, etc.)
- ❌ `summary` - Detailed description
- ❌ `assigned_to` - Assigned user

#### Workflow Runs:
- ✅ All fields already captured!

---

## How to Add These Fields

### Option 1: Run Migration in Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** (https://supabase.com/dashboard/project/YOUR_PROJECT/sql)
3. Create a new query
4. Copy the contents of `migrations/add-missing-fields.sql`
5. Click **Run** to execute the migration
6. Wait for confirmation that all statements executed successfully

### Option 2: Use Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push migrations/add-missing-fields.sql
```

### Option 3: Manual Column Addition

If you prefer to add columns one at a time, you can run these key statements:

```sql
-- Essential fields for Pull Requests
ALTER TABLE pull_requests 
ADD COLUMN IF NOT EXISTS url TEXT,
ADD COLUMN IF NOT EXISTS provider TEXT,
ADD COLUMN IF NOT EXISTS state_changed_at TIMESTAMP WITH TIME ZONE;

-- Essential fields for Incidents  
ALTER TABLE incidents 
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS status TEXT,
ADD COLUMN IF NOT EXISTS incident_type TEXT;
```

---

## After Running the Migration

Once the migration is complete, re-ingest your data to populate the new fields:

```bash
# Re-ingest Total Synergy UI data
export $(cat .env | grep -v '^#' | xargs) && \
node scripts/ingest-response-data.mjs \
  "response(total_synergy-UI).json" \
  "84efcc9e-e303-4e55-9f7a-c3730a7d7d8e"

# Re-ingest Cloud Git data  
export $(cat .env | grep -v '^#' | xargs) && \
node scripts/ingest-response-data.mjs \
  "response(total-synergy-5-cloud-git).json" \
  "5b9f1ea9-4c3e-4f54-af3d-757035fc4941"
```

---

## What Happens Now

The ingestion script has been updated to include ALL fields from your JSON:

### ✅ Currently Ingested (Working Now):
- **Pull Requests**: 239 + 261 = 500 total
- **Incidents**: 275 + 716 = 991 total  
- **Workflow Runs**: 2,492 + 2,292 = 4,784 total

### ✅ After Migration (Will Include):
- All existing data PLUS
- PR URLs, reviewers, time metrics
- Incident titles, statuses, types
- Complete DORA metrics calculations

---

## Verification

After re-ingesting, verify the new fields are populated:

```bash
node scripts/check-schemas.mjs
```

You should see the new columns in the output!

---

## Important Notes

1. **No Data Loss**: Existing data remains safe. New columns will be added.
2. **Backward Compatible**: Old ingestion runs will continue to work.
3. **Re-ingest Safe**: The script uses `upsert` with `onConflict: 'id'` so re-running is safe.
4. **Performance**: New indexes are created for common queries on the new fields.

---

## Need Help?

If you encounter any errors during migration:
1. Check the error message in Supabase dashboard
2. Ensure you have admin/service role permissions  
3. Share the specific error message for troubleshooting
