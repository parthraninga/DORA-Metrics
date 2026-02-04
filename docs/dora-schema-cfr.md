# Change Failure Rate (CFR) – Tables and Relationships

Tables and columns used for **Change Failure Rate**, **Mean Time to Recovery**, and **Deployments with incidents**. All workflow runs in the selected time period (for the team’s repos) drive these metrics.

## Relationship overview

```
teams (id, name)
  └── team_repos (team_id, repo_id)  ← many-to-many
        └── repos (id, repo_name, org_name, dev_branch, prod_branch, stage_branch, token_id, ...)
              └── fetch_data (id, repo_id, fetched_at, state, raw_response)
                    └── workflow_runs (id, repo_id, fetch_data_id, run_id, name, head_branch, status, conclusion, created_at, updated_at, html_url, ...)
                    └── incidents (id, repo_id, fetch_data_id, workflow_run_id, creation_date, resolved_date, ...)
                          ↑ derived from workflow_runs: failure run = creation_date, next success run = resolved_date
```

## Tables and columns

### teams
| Column     | Type      | Description        |
|-----------|-----------|--------------------|
| id        | uuid (PK) | Team id            |
| name      | text      | Team name          |
| created_at| timestamptz | Created at       |

### team_repos (junction: teams ↔ repos)
| Column     | Type      | Description        |
|-----------|-----------|--------------------|
| team_id   | uuid (FK → teams.id) | Team id   |
| repo_id   | uuid (FK → repos.id) | Repo id   |
| created_at| timestamptz | Created at       |

### repos
| Column       | Type      | Description              |
|-------------|-----------|--------------------------|
| id          | uuid (PK) | Repo id                  |
| repo_name   | text      | Repository name          |
| org_name    | text      | Org name                 |
| dev_branch  | text      | Dev branch name          |
| prod_branch | text      | Production branch name   |
| stage_branch| text      | Stage branch name        |
| token_id    | uuid (FK) | Token for API access     |
| cfr_type    | text      | 'CI-CD' or 'PR_MERGE'    |
| last_fetched_at | timestamptz | Last fetch time     |
| created_at  | timestamptz | Created at            |

### fetch_data (one row per repo per fetch)
| Column       | Type      | Description                    |
|-------------|-----------|--------------------------------|
| id          | uuid (PK) | Fetch id                       |
| repo_id     | uuid (FK → repos.id) | Repo id              |
| fetched_at  | timestamptz | When fetch ran              |
| state       | text      | 'processing', 'success', 'failure' |
| raw_response| jsonb     | Lambda response (workflow_runs, etc.) |

### workflow_runs (from Lambda raw_response, per repo per fetch)
| Column     | Type      | Description                    |
|-----------|-----------|--------------------------------|
| id        | uuid (PK) | Row id                         |
| repo_id   | uuid (FK → repos.id) | Repo id              |
| fetch_data_id | uuid (FK → fetch_data.id) | Fetch id   |
| run_id    | bigint    | GitHub/GitLab run id           |
| name      | text      | Workflow name                  |
| head_branch | text    | Branch                         |
| status    | text      | e.g. completed                 |
| conclusion| text      | **'success'** or **'failure'** |
| created_at| timestamptz | Run created at (GitHub)     |
| updated_at| timestamptz | Run updated at               |
| html_url  | text      | Link to run                    |
| actor     | jsonb     | Who triggered                  |
| workflow_id| bigint   | Workflow id                    |

### incidents (derived from workflow_runs)
| Column         | Type      | Description                                    |
|----------------|-----------|------------------------------------------------|
| id             | uuid (PK) | Incident row id                               |
| repo_id        | uuid (FK → repos.id) | Repo id                        |
| fetch_data_id  | uuid (FK → fetch_data.id) | Fetch id                 |
| workflow_run_id| bigint    | The **failure** workflow run’s run_id          |
| creation_date  | timestamptz | Failure run’s created_at (incident start)  |
| resolved_date  | timestamptz | **Next** workflow run with conclusion=success created_at (recovery) |
| created_at     | timestamptz | Row inserted at                            |

**How incidents are derived (per repo, ascending by created_at):**

1. Take all `workflow_runs` for the repo (from fetch_data).
2. Sort by `created_at` ascending.
3. For each run with `conclusion = 'failure'`:
   - **Incident start** = that run’s `created_at` → `incidents.creation_date`.
   - **Recovery** = first later run with `conclusion = 'success'` → that run’s `created_at` → `incidents.resolved_date`.
4. One incident row per such failure (with optional resolved_date).

**CFR (Change Failure Rate):**

- Numerator: count of **incidents** in the period (team’s repos, incident `created_at` in date range).
- Denominator: count of **workflow_runs** in the period (team’s repos, `created_at` in date range).
- CFR = (incidents / workflow_runs) × 100.

**MTTR (Mean Time to Recovery):**

- For incidents with both `creation_date` and `resolved_date`:  
  MTTR = mean(`resolved_date` − `creation_date`) in seconds.

**Deployments with incidents:**

- “Deployments” in the UI = workflow runs that have at least one incident (the failure run).
- Each such deployment shows the failure workflow run and, when present, the recovery workflow run (next success).

## Why “No resolved incidents” can appear

- **No workflow runs in the period**  
  Run **Fetch data** for the team’s repos (Sync page) so `workflow_runs` (and then `incidents`) are populated.

- **Only successful runs**  
  Incidents require at least one run with `conclusion = 'failure'`; if all runs are success, there are no incidents.

- **Failures but no following success**  
  Resolved incidents need a later run with `conclusion = 'success'`. If the next run is still failure or missing, that incident has no `resolved_date` and may not be shown as “resolved” in the UI.

To debug: list **all** `workflow_runs` for the team’s repos in the selected time period (e.g. on the Deployments with incidents view when there are no incidents) and check conclusion and order by `created_at`.
