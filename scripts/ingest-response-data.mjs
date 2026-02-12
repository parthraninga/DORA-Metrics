#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Generate a deterministic UUID v5-like from a namespace and name
 * This ensures the same input always produces the same UUID
 */
function generateDeterministicUUID(namespace, name) {
  const hash = createHash('sha1');
  hash.update(namespace + name);
  const hex = hash.digest('hex');
  
  // Format as UUID v5: xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    '5' + hex.substring(13, 16),
    ((parseInt(hex.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hex.substring(18, 20),
    hex.substring(20, 32)
  ].join('-');
}

/**
 * Map pull request data to database schema
 */
function mapPullRequest(pr, repoId, fetchDataId = null) {
  return {
    id: pr.id,
    repo_id: repoId,
    fetch_data_id: fetchDataId, // Will be null if not provided
    pr_no: pr.number?.toString() || pr.pr_no?.toString(),
    title: pr.title,
    author: typeof pr.author === 'object' ? pr.author.username : pr.author,
    first_commit_to_open: pr.first_commit_to_open,
    cycle_time: pr.cycle_time,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    state: pr.state,
    base_branch: pr.base_branch,
    head_branch: pr.head_branch,
    commits: pr.commits,
    additions: pr.additions,
    deletions: pr.deletions,
    comments: pr.comments,
    // Additional fields (will be ignored if columns don't exist in DB)
    url: pr.url,
    state_changed_at: pr.state_changed_at,
    provider: pr.provider,
    reviewers: pr.reviewers ? JSON.stringify(pr.reviewers) : null,
    lead_time: pr.lead_time,
    merge_time: pr.merge_time,
    deploy_time: pr.deploy_time,
    first_response_time: pr.first_response_time,
    rework_time: pr.rework_time,
    merge_to_deploy: pr.merge_to_deploy
  };
}

/**
 * Map incident data to database schema
 */
function mapIncident(incident, repoId, fetchDataId = null) {
  // Helper to validate UUID or return null
  const validateUuid = (value) => {
    if (!value || value === 'None' || value === 'null' || value === 'undefined') {
      return null;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return null;
    }
    return value;
  };

  // Generate UUID from key field if incident ID is invalid
  let incidentId = validateUuid(incident.id);
  if (!incidentId) {
    // Use the 'key' field to generate a deterministic UUID
    if (incident.key) {
      incidentId = generateDeterministicUUID('incident', incident.key);
    } else {
      // If no key field either, skip this incident
      console.warn(`⚠️  Skipping incident with no valid ID or key:`, incident.title);
      return null;
    }
  }

  // Extract workflow run numeric ID from key if available (e.g., "workflow-20118081300")
  let workflowRunId = null;
  if (incident.key && incident.key.startsWith('workflow-')) {
    const runNumber = incident.key.replace('workflow-', '');
    if (runNumber && !isNaN(runNumber)) {
      workflowRunId = parseInt(runNumber, 10); // Store as bigint, not UUID
    }
  }

  return {
    id: incidentId,
    repo_id: repoId,
    fetch_data_id: fetchDataId,
    pull_request_id: validateUuid(incident.pull_request_id), // Keep null if not provided
    workflow_run_id: workflowRunId, // Bigint or null
    pr_no: incident.incident_number?.toString(),
    creation_date: incident.creation_date,
    resolved_date: incident.resolved_date,
    created_at: incident.creation_date,
    // Additional fields (will be ignored if columns don't exist in DB)
    title: incident.title,
    status: incident.status?.replace('IncidentStatus.', ''),
    incident_type: incident.incident_type,
    url: incident.url,
    provider: incident.provider?.replace('IncidentProvider.', ''),
    summary: incident.summary,
    assigned_to: incident.assigned_to?.username
  };
}

/**
 * Map workflow run data to database schema
 */
function mapWorkflowRun(run, repoId, fetchDataId = null) {
  // Generate UUID from numeric ID if not already UUID format
  let workflowRunId = run.id;
  
  if (!workflowRunId) {
    console.warn(`⚠️  Skipping workflow run with no ID:`, run.name);
    return null;
  }
  
  // If ID is not UUID format, generate a deterministic UUID from it
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workflowRunId.toString())) {
    workflowRunId = generateDeterministicUUID('workflow_run', workflowRunId.toString());
  }
  
  return {
    id: workflowRunId,
    repo_id: repoId,
    fetch_data_id: fetchDataId,
    run_id: (run.run_id || run.id)?.toString(),
    name: run.name || run.workflow_name,
    head_branch: run.head_branch,
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    updated_at: run.updated_at,
    html_url: run.html_url || run.url,
    actor: typeof run.actor === 'object' ? run.actor?.username : run.actor,
    workflow_id: run.workflow_id?.toString()
  };
}

/**
 * Main ingestion function
 */
async function ingestData(jsonFilePath, targetRepoId) {
  console.log('\n🚀 Starting data ingestion...');
  console.log(`📁 Reading file: ${jsonFilePath}`);
  console.log(`🎯 Target repo_id: ${targetRepoId}\n`);

  try {
    // Read JSON file
    const fileContent = await readFile(jsonFilePath, 'utf-8');
    const data = JSON.parse(fileContent);

    console.log(`✅ Successfully parsed JSON file`);
    console.log(`   Repo: ${data.repo_org}/${data.repo_name}`);

    // Check if repo exists
    console.log(`\n🔍 Checking if repo ${targetRepoId} exists...`);
    const { data: existingRepo, error: repoCheckError } = await supabase
      .from('repos')
      .select('id, repo_name, org_name')
      .eq('id', targetRepoId)
      .single();

    if (repoCheckError && repoCheckError.code !== 'PGRST116') {
      throw new Error(`Error checking repo: ${repoCheckError.message}`);
    }

    if (!existingRepo) {
      console.log(`❌ Repo ${targetRepoId} not found in database`);
      console.log(`   Please create the repo entry first or use an existing repo_id`);
      console.log(`\n💡 Tip: Check existing repos with:`);
      console.log(`   SELECT id, repo_name, org_name FROM repos;`);
      process.exit(1);
    }

    console.log(`✅ Found repo: ${existingRepo.org_name}/${existingRepo.repo_name}`);

    // Create fetch_data record
    console.log(`\n📝 Creating fetch_data record...`);
    const { data: fetchDataRecord, error: fetchDataError } = await supabase
      .from('fetch_data')
      .insert({
        repo_id: targetRepoId,
        fetched_at: new Date().toISOString(),
        state: 'success',
        raw_response: data
      })
      .select('id')
      .single();

    if (fetchDataError) {
      throw new Error(`Error creating fetch_data record: ${fetchDataError.message}`);
    }

    const fetchDataId = fetchDataRecord.id;
    console.log(`✅ Created fetch_data record: ${fetchDataId}`);

    // Process repos data
    const repos = data.repos || [];
    
    if (repos.length === 0) {
      console.log('⚠️  No repo data found in JSON');
      return;
    }

    let totalPRs = 0;
    let totalIncidents = 0;
    let totalWorkflowRuns = 0;

    for (const repoData of repos) {
      console.log(`\n📊 Processing repo: ${repoData.org_name}/${repoData.repo_name}`);

      // Process Pull Requests
      if (repoData.pull_requests && repoData.pull_requests.length > 0) {
        const pullRequests = repoData.pull_requests;
        console.log(`   📝 Pull Requests: ${pullRequests.length}`);

        // Map and filter pull requests  
        const prsToInsert = pullRequests
          .map(pr => mapPullRequest(pr, targetRepoId, fetchDataId))
          .filter(pr => pr !== null);

        if (prsToInsert.length > 0) {
          // Upsert pull requests (upsert to handle duplicates)
          const { data: insertedPRs, error: prError } = await supabase
            .from('pull_requests')
            .upsert(prsToInsert, {
              onConflict: 'id',
              ignoreDuplicates: false
            })
            .select('id');

          if (prError) {
            console.error(`   ❌ Error inserting PRs: ${prError.message}`);
            if (prError.details) console.error(`      Details: ${prError.details}`);
            if (prError.hint) console.error(`      Hint: ${prError.hint}`);
          } else {
            totalPRs += insertedPRs?.length || prsToInsert.length;
            console.log(`   ✅ Inserted/Updated ${insertedPRs?.length || prsToInsert.length} pull requests`);
          }
        }
      }

      // Process Incidents
      if (repoData.incidents && repoData.incidents.length > 0) {
        const incidents = repoData.incidents;
        console.log(`   🚨 Incidents: ${incidents.length}`);

        // Map and filter incidents
        const incidentsToInsert = incidents
          .map(incident => mapIncident(incident, targetRepoId, fetchDataId))
          .filter(incident => incident !== null);

        if (incidentsToInsert.length > 0) {
          // Upsert incidents
          const { data: insertedIncidents, error: incidentError } = await supabase
            .from('incidents')
            .upsert(incidentsToInsert, {
              onConflict: 'id',
              ignoreDuplicates: false
            })
            .select('id');

          if (incidentError) {
            console.error(`   ❌ Error inserting incidents: ${incidentError.message}`);
            if (incidentError.details) console.error(`      Details: ${incidentError.details}`);
            if (incidentError.hint) console.error(`      Hint: ${incidentError.hint}`);
          } else {
            totalIncidents += insertedIncidents?.length || incidentsToInsert.length;
            console.log(`   ✅ Inserted/Updated ${insertedIncidents?.length || incidentsToInsert.length} incidents`);
          }
        }
      }

      // Process Workflow Runs (if present)
      if (repoData.workflow_runs && repoData.workflow_runs.length > 0) {
        const workflowRuns = repoData.workflow_runs;
        console.log(`   ⚙️  Workflow Runs: ${workflowRuns.length}`);

        // Map and filter workflow runs (skip non-UUID IDs)
        const runsToInsert = workflowRuns
          .map(run => mapWorkflowRun(run, targetRepoId, fetchDataId))
          .filter(run => run !== null);

        console.log(`   ⚙️  Valid Workflow Runs (with UUID): ${runsToInsert.length}`);

        if (runsToInsert.length > 0) {
          const { data: insertedRuns, error: runError } = await supabase
            .from('workflow_runs')
            .upsert(runsToInsert, {
              onConflict: 'id',
              ignoreDuplicates: false
            })
            .select('id');

          if (runError) {
            console.error(`   ❌ Error inserting workflow runs: ${runError.message}`);
            if (runError.details) console.error(`      Details: ${runError.details}`);
            if (runError.hint) console.error(`      Hint: ${runError.hint}`);
          } else {
            totalWorkflowRuns += insertedRuns?.length || runsToInsert.length;
            console.log(`   ✅ Inserted/Updated ${insertedRuns?.length || runsToInsert.length} workflow runs`);
          }
        } else {
          console.log(`   ⚠️  Skipping workflow runs (no valid UUIDs found)`);
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 INGESTION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Total Pull Requests: ${totalPRs}`);
    console.log(`✅ Total Incidents: ${totalIncidents}`);
    console.log(`✅ Total Workflow Runs: ${totalWorkflowRuns}`);
    console.log('='.repeat(60));
    console.log('✅ Data ingestion completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Error during ingestion:');
    console.error(error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let jsonFile = args[0];
const repoId = args[1];

if (!jsonFile || !repoId) {
  console.error('Usage: node ingest-response-data.mjs <json-file> <repo-id>');
  console.error('Example: node ingest-response-data.mjs response.json 84efcc9e-e303-4e55-9f7a-c3730a7d7d8e');
  process.exit(1);
}

// Resolve path
if (!jsonFile.startsWith('/')) {
  jsonFile = join(process.cwd(), jsonFile);
}

// Run ingestion
ingestData(jsonFile, repoId).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
