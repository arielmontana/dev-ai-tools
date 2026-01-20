#!/usr/bin/env node

import clipboard from 'clipboardy';
import { loadEnvConfig, getConfig } from './lib/config.js';
import {
  createAuthHeader,
  buildBaseUrl,
  getRepositories,
  getPullRequest,
  getPRWorkItems,
  getWorkItemWithRelations,
  getPRIterations,
  getPRChanges,
  extractUS
} from './lib/azure.js';
import { callGroq } from './lib/llm.js';
import { findParentUserStory, getWorkItemType } from './lib/workitem.js';
import { filterCodeFiles, extractDiffContent } from './lib/diff.js';
import { publishReview } from './lib/pr-comments.js';
import { askQuestion, printHeader, printDivider, validateNumericId } from './lib/cli.js';
import { PARENT_WORK_ITEM_TYPES, WORK_ITEM_TYPES, TIMEOUTS } from './lib/constants.js';

loadEnvConfig(import.meta.url);
const config = getConfig(
  ['AZURE_ORG', 'AZURE_PROJECT', 'AZURE_PAT', 'GROQ_API_KEY'],
  ['AZURE_REPO']
);

const baseUrl = buildBaseUrl(config.AZURE_ORG, config.AZURE_PROJECT);
const authHeader = createAuthHeader(config.AZURE_PAT);

const PROMPT_WITH_US = `Output a code review with the EXACT structure below.

Review only + lines. Be concise.

CLASSIFICATION:
- CRITICAL: Bugs, Security
- IMPORTANT: Performance, CleanCode
- MINOR: BestPractices

VERDICT:
- Any CRITICAL -> REQUEST CHANGES
- Any IMPORTANT -> APPROVE WITH COMMENTS
- Only MINOR or nothing -> APPROVE

CRITICAL BUGS RULES (avoid false positives):
- Only mark CRITICAL if bug is EVIDENT in visible code
- Do NOT assume external/inherited methods return null
- If method validation is unknown, mark IMPORTANT with "(verify)" note
- Prefer false negatives over false positives for CRITICAL
- Common safe patterns: GetCurrentUser, GetCurrentUserEmail usually throw if null

RULES:
- File column: ONLY filename (e.g. "Query.cs"), NOT full path
- AC Coverage table MUST have 4 columns: AC | Description | Status | Where
- Description column: 2-5 words summarizing each AC
- Do NOT repeat the input files or CHANGES section
- Output ONLY the review structure below

---
OUTPUT STRUCTURE:
---

## Code Review

### Good
- [positive point]

### Issues

| Severity | Category | File | Line | Issue | Fix |
|----------|----------|------|------|-------|-----|
| CRITICAL | Bugs | Query.cs | 45 | [brief] | [brief] |
| IMPORTANT | Performance | Mutation.cs | 120 | [brief] | [brief] |
| MINOR | CleanCode | Service.cs | 30 | [brief] | [brief] |

### Missing Tests
- Class.Method

### AC Coverage
*(MUST include Description column with 2-5 word summary of each AC)*

| AC | Description | Status | Where |
|----|-------------|--------|-------|
| 1 | User can upload file | Done | Service.Upload |
| 2 | Validate file size | Missing | Not implemented |
| 3 | Show error message | Done | Controller.Handle |

### Verdict
**APPROVE**

---
*prreview*`;

const PROMPT_NO_US = `Output a code review with the EXACT structure below.

Review only + lines. Be concise.

CLASSIFICATION:
- CRITICAL: Bugs, Security
- IMPORTANT: Performance, CleanCode
- MINOR: BestPractices

VERDICT:
- Any CRITICAL -> REQUEST CHANGES
- Any IMPORTANT -> APPROVE WITH COMMENTS
- Only MINOR or nothing -> APPROVE

CRITICAL BUGS RULES (avoid false positives):
- Only mark CRITICAL if bug is EVIDENT in visible code
- Do NOT assume external/inherited methods return null
- If method validation is unknown, mark IMPORTANT with "(verify)" note
- Prefer false negatives over false positives for CRITICAL
- Common safe patterns: GetCurrentUser, GetCurrentUserEmail usually throw if null

RULES:
- File column: ONLY filename (e.g. "Query.cs"), NOT full path
- Do NOT repeat the input files or CHANGES section
- Output ONLY the review structure below

---
OUTPUT STRUCTURE:
---

## Code Review

### Good
- [positive point]

### Issues

| Severity | Category | File | Line | Issue | Fix |
|----------|----------|------|------|-------|-----|
| CRITICAL | Bugs | Query.cs | 45 | [brief] | [brief] |
| IMPORTANT | Performance | Mutation.cs | 120 | [brief] | [brief] |
| MINOR | CleanCode | Service.cs | 30 | [brief] | [brief] |

### Missing Tests
- Class.Method

### Verdict
**APPROVE**

---
*prreview*
No US linked`;

async function review(prTitle, files, us) {
  const prompt = us ? PROMPT_WITH_US : PROMPT_NO_US;
  const usContext = us ? `\nUS#${us.id}: ${us.title}\nAC:\n${us.ac}` : '';

  return callGroq(config.GROQ_API_KEY, {
    systemPrompt: 'You are a code reviewer. Follow the EXACT output structure. Never skip sections. AC Coverage table MUST have 4 columns: AC | Description | Status | Where. Description is a 2-5 word summary of the acceptance criteria.',
    userPrompt: `${prompt}${usContext}\n\nPR: ${prTitle}\n\nCHANGES:\n${files}`,
    maxTokens: 2000,
    temperature: 0.1,
    timeoutMs: TIMEOUTS.LLM_LONG
  });
}

async function findLinkedUserStory(repoId, prId) {
  const wis = await getPRWorkItems(baseUrl, authHeader, repoId, prId, TIMEOUTS.DEFAULT);

  for (const item of wis) {
    const wiId = item.id || item.url?.split('/').pop();
    if (!wiId) continue;

    const wi = await getWorkItemWithRelations(baseUrl, authHeader, wiId, TIMEOUTS.DEFAULT);
    if (!wi) continue;

    const wiType = getWorkItemType(wi);

    if (PARENT_WORK_ITEM_TYPES.includes(wiType)) {
      const us = extractUS(wi);
      console.log(`  US#${us.id}: "${us.title}"`);
      return us;
    }

    if (wiType === WORK_ITEM_TYPES.TASK) {
      console.log(`  Task#${wi.id} linked, searching parent US...`);
      const parentWi = await findParentUserStory(wi, baseUrl, authHeader, TIMEOUTS.DEFAULT);
      if (parentWi) {
        const us = extractUS(parentWi);
        console.log(`  US#${us.id}: "${us.title}" (parent of Task#${wi.id})`);
        return us;
      }
    }
  }

  console.log('  No US linked');
  return null;
}

async function main() {
  const prId = process.argv[2];
  const repoArg = process.argv[3];

  printHeader('PRREVIEW - AI Code Review (Changes Only)');

  if (!prId) {
    console.log('  Usage: prreview <pr-id> [repo]\n');
    console.log('  Reviews ONLY the changes in the PR.');
    console.log('  CRITICAL (bugs/security) > IMPORTANT (perf/clean) > MINOR (tests/practices)\n');
    process.exit(1);
  }

  const id = validateNumericId(prId, 'PR ID');

  try {
    console.log('  Fetching PR...');
    const repos = await getRepositories(baseUrl, authHeader, TIMEOUTS.DEFAULT);
    const repoName = repoArg || config.AZURE_REPO;
    const repo = repoName
      ? repos.find(r => r.name.toLowerCase() === repoName.toLowerCase())
      : repos[0];

    if (!repo) {
      console.error(`  Repo not found. Available: ${repos.map(r => r.name).join(', ')}`);
      process.exit(1);
    }
    console.log(`  ${repo.name}`);

    const pr = await getPullRequest(baseUrl, authHeader, repo.id, id, TIMEOUTS.DEFAULT);
    console.log(`  "${pr.title}"`);
    console.log(`  ${pr.createdBy?.displayName || 'Unknown'}`);

    const sourceCommit = pr.lastMergeSourceCommit?.commitId;
    const targetCommit = pr.lastMergeTargetCommit?.commitId;

    const us = await findLinkedUserStory(repo.id, id);

    console.log('  Getting changes...');
    const iters = await getPRIterations(baseUrl, authHeader, repo.id, id, TIMEOUTS.DEFAULT);
    const latestIteration = iters[iters.length - 1];
    const iterationId = latestIteration.id;
    const changes = await getPRChanges(baseUrl, authHeader, repo.id, id, iterationId, TIMEOUTS.DEFAULT);

    const codeFiles = filterCodeFiles(changes);
    console.log(`  ${codeFiles.length} files changed`);

    if (!codeFiles.length) {
      console.log('\n  No code files.\n');
      process.exit(0);
    }

    console.log('  Extracting diffs...');
    const { diffContent, addedLines } = await extractDiffContent(
      codeFiles, baseUrl, authHeader, repo.id, sourceCommit, targetCommit
    );

    console.log(`  ~${addedLines} lines changed`);

    if (!diffContent.trim()) {
      console.log('\n  No significant changes found.\n');
      process.exit(0);
    }

    console.log('  Reviewing...\n');
    const result = await review(pr.title, diffContent, us);

    try {
      clipboard.writeSync(result);
      console.log('  Copied to clipboard!');
    } catch {
      console.log('  Clipboard unavailable.');
    }

    printDivider();
    console.log('\n' + result + '\n');
    printDivider();

    const answer = await askQuestion('  Publish to PR? (y/n): ');

    if (answer === 'y' || answer === 'yes') {
      console.log('\n  Publishing...');
      await publishReview({
        baseUrl,
        authHeader,
        repoId: repo.id,
        prId: id,
        reviewContent: result,
        changes,
        iterationId
      });
      console.log('\n  Review published!');
      console.log(`  https://dev.azure.com/${config.AZURE_ORG}/${encodeURIComponent(config.AZURE_PROJECT)}/_git/${repo.name}/pullrequest/${id}`);
    } else {
      console.log('\n  Not published. Use clipboard.');
    }
    console.log('');

  } catch (e) {
    console.error(`  ${e.message}`);
    console.log('\n  Check: PR exists, PAT has Code>Read/Write\n');
    process.exit(1);
  }
}

main();
