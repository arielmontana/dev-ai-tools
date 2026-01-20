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
import * as reactTailwindPrompts from './prompts/react-tailwind.js';
import * as backendPrompts from './prompts/backend.js';

loadEnvConfig(import.meta.url);
const config = getConfig(
  ['AZURE_ORG', 'AZURE_PROJECT', 'AZURE_PAT', 'GROQ_API_KEY'],
  ['AZURE_REPO']
);

const baseUrl = buildBaseUrl(config.AZURE_ORG, config.AZURE_PROJECT);
const authHeader = createAuthHeader(config.AZURE_PAT);

// Prompt mapping
const PROMPTS = {
  'react-tailwind': reactTailwindPrompts,
  'backend': backendPrompts
};

async function review(prTitle, files, us, promptModule) {
  const prompt = us ? promptModule.PROMPT_WITH_US : promptModule.PROMPT_NO_US;
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
  const arg3 = process.argv[3];
  const arg4 = process.argv[4]?.toLowerCase();

  // Determine if arg3 is repo or codeType
  // If arg4 exists, arg3 is repo; otherwise arg3 is codeType
  const repoArg = arg4 ? arg3 : undefined;
  const codeType = arg4 || arg3?.toLowerCase();

  printHeader('PRREVIEW - AI Code Review (Changes Only)');

  if (!prId || !codeType || !['be', 'fe'].includes(codeType)) {
    console.log('  Usage: prreview <pr-id> [repo] <be|fe>\n');
    console.log('  Reviews ONLY the changes in the PR.');
    console.log('  CRITICAL (bugs/security) > IMPORTANT (perf/clean) > MINOR (tests/practices)\n');
    console.log('  Arguments:');
    console.log('    pr-id   Pull Request ID');
    console.log('    repo    Repository name (optional)');
    console.log('    be      Backend review');
    console.log('    fe      Frontend review\n');
    console.log('  Example: prreview 123 be\n');
    console.log('  Example: prreview 123 myrepo fe\n');
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

    // Select prompt based on code type
    let selectedPrompt;
    if (codeType === 'fe') {
      const feType = await askQuestion('  Select frontend type (react-tailwind): ');
      const feTypeKey = feType === 'react-tailwind' ? 'react-tailwind' : 'react-tailwind'; // default to react-tailwind
      selectedPrompt = PROMPTS[feTypeKey] || PROMPTS['react-tailwind'];
    } else {
      selectedPrompt = PROMPTS['backend'];
    }

    console.log('  Reviewing...\n');
    const result = await review(pr.title, diffContent, us, selectedPrompt);

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
