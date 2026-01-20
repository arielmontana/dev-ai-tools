#!/usr/bin/env node

import clipboard from 'clipboardy';
import { loadEnvConfig, getConfig } from './lib/config.js';
import { createAuthHeader, buildBaseUrl, getRepositories, getPullRequest, getPRComments } from './lib/azure.js';
import { callGroq } from './lib/llm.js';
import { extractPendingComments } from './lib/review.js';
import { printHeader, printDivider, validateNumericId } from './lib/cli.js';
import { TIMEOUTS } from './lib/constants.js';

loadEnvConfig(import.meta.url);
const config = getConfig(
  ['AZURE_ORG', 'AZURE_PROJECT', 'AZURE_PAT', 'GROQ_API_KEY'],
  ['AZURE_REPO']
);

const baseUrl = buildBaseUrl(config.AZURE_ORG, config.AZURE_PROJECT);
const authHeader = createAuthHeader(config.AZURE_PAT);

const GENERATE_PROMPT = `Convert these PR comments into a MINIMAL prompt for Cursor.
ALL OUTPUT MUST BE IN ENGLISH.

STRICT RULES:
- Only list of concrete actions
- One line per fix
- Format: "In [file] line [N]: [action]"
- If no line number, omit it
- No explanations, no headers, no markdown
- Maximum 10 words per action
- End with "Code only, no explanations"

EXAMPLE OUTPUT:
Fix PR comments:
- In UserService.cs line 45: add null check
- In UserService.cs line 78: use Include to avoid N+1
- In Modal.tsx: use useCallback for handleClick
Code only, no explanations`;

async function generateMinimalPrompt(comments) {
  if (comments.length === 0) {
    return null;
  }

  const commentsText = comments.map(c => {
    const location = c.line ? `${c.file} line ${c.line}` : (c.file || 'General');
    return `- ${location}: "${c.comment}"`;
  }).join('\n');

  const userMessage = `${GENERATE_PROMPT}

PR COMMENTS:
${commentsText}`;

  return callGroq(config.GROQ_API_KEY, {
    userPrompt: userMessage,
    maxTokens: 300,
    temperature: 0.05,
    timeoutMs: TIMEOUTS.LLM_SHORT
  });
}

async function main() {
  const prId = process.argv[2];
  const repoNameArg = process.argv[3];

  printHeader('US2PR - Optimized prompt from PR comments');

  if (!prId) {
    console.log('  Usage: prfix <pull-request-id> [repo-name]');
    console.log('');
    console.log('  Examples:');
    console.log('    prfix 123');
    console.log('    prfix 123 MyRepo');
    console.log('');
    console.log('  Generates optimized prompt for Cursor from');
    console.log('  pending PR comments.');
    console.log('');
    process.exit(1);
  }

  const id = validateNumericId(prId, 'PR ID');

  try {
    console.log('  Fetching repository...');
    const repos = await getRepositories(baseUrl, authHeader, TIMEOUTS.DEFAULT);

    let repo;
    const repoName = repoNameArg || config.AZURE_REPO;

    if (repoName) {
      repo = repos.find(r => r.name.toLowerCase() === repoName.toLowerCase());
      if (!repo) {
        console.error(`  Repository "${repoName}" not found`);
        console.log('');
        console.log('  Available repositories:');
        repos.forEach(r => console.log(`    - ${r.name}`));
        process.exit(1);
      }
    } else {
      repo = repos[0];
    }
    console.log(`  Repo: ${repo.name}`);

    console.log(`  Fetching PR #${id}...`);
    const pr = await getPullRequest(baseUrl, authHeader, repo.id, id, TIMEOUTS.DEFAULT);
    console.log(`  "${pr.title}"`);

    console.log('  Fetching comments...');
    const threads = await getPRComments(baseUrl, authHeader, repo.id, id, TIMEOUTS.DEFAULT);
    const pendingComments = extractPendingComments(threads);

    console.log(`  Pending comments: ${pendingComments.length}`);

    if (pendingComments.length === 0) {
      console.log('');
      console.log('  No pending comments. All resolved!');
      console.log('');
      process.exit(0);
    }

    console.log('  Generating optimized prompt...');
    console.log('');

    const prompt = await generateMinimalPrompt(pendingComments);

    try {
      clipboard.writeSync(prompt);
      console.log('  Prompt copied to clipboard!');
    } catch {
      console.log('  Clipboard unavailable. Output printed below.');
    }

    printDivider();
    console.log(prompt);
    printDivider();
    console.log('');
    console.log('  Paste in Cursor (Ctrl+V) and press Enter');
    console.log('');

  } catch (error) {
    console.error(`  Error: ${error.message}`);
    console.log('');
    console.log('  Possible causes:');
    console.log('    - PR does not exist');
    console.log('    - PAT missing Code > Read permissions');
    console.log('    - Incorrect repository');
    console.log('');
    console.log('  To add PAT permissions:');
    console.log('    1. Go to Azure DevOps -> User Settings -> Personal Access Tokens');
    console.log('    2. Edit token -> Add Code > Read');
    console.log('');
    process.exit(1);
  }
}

main();
