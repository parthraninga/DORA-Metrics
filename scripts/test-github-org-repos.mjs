#!/usr/bin/env node
/**
 * Test script: list repos for an org (or user) using a GitHub PAT.
 * Usage: node scripts/test-github-org-repos.mjs <GITHUB_PAT> <ORG_OR_USER_NAME>
 * Example: node scripts/test-github-org-repos.mjs ghp_xxxx KPM-HoldCo-Inc-Current
 *
 * Tries GET /orgs/{org}/repos first. If 404, tries GET /users/{username}/repos.
 */

const token = process.argv[2];
const orgOrUser = process.argv[3];

if (!token || !orgOrUser) {
  console.error('Usage: node scripts/test-github-org-repos.mjs <GITHUB_PAT> <ORG_OR_USER_NAME>');
  process.exit(1);
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `token ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

async function main() {
  const encoded = encodeURIComponent(orgOrUser);

  // 1) Try orgs endpoint
  const orgUrl = `https://api.github.com/orgs/${encoded}/repos?per_page=100&sort=full_name`;
  console.log('Trying GET', orgUrl);
  let res = await fetch(orgUrl, { headers });
  let body = await res.json();

  if (res.ok && Array.isArray(body)) {
    console.log('OK (org):', body.length, 'repos');
    body.slice(0, 5).forEach((r) => console.log(' -', r.full_name));
    if (body.length > 5) console.log(' ... and', body.length - 5, 'more');
    return;
  }

  if (res.status === 404) {
    console.log('Org not found (404). Trying as user...');
    const userUrl = `https://api.github.com/users/${encoded}/repos?per_page=100&sort=full_name`;
    res = await fetch(userUrl, { headers });
    body = await res.json();
  }

  if (!res.ok) {
    console.error('Error', res.status, typeof body === 'object' ? JSON.stringify(body, null, 2) : body);
    process.exit(1);
  }

  if (Array.isArray(body)) {
    console.log('OK (user):', body.length, 'repos');
    body.slice(0, 5).forEach((r) => console.log(' -', r.full_name));
    if (body.length > 5) console.log(' ... and', body.length - 5, 'more');
  } else {
    console.error('Unexpected response:', body);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
