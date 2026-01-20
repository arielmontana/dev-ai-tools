#!/usr/bin/env node

import clipboard from 'clipboardy';
import { loadEnvConfig, getConfig } from './lib/config.js';
import { createAuthHeader, buildBaseUrl, getWorkItem, extractFields } from './lib/azure.js';
import { callGroq } from './lib/llm.js';
import { cleanOutputBackend } from './lib/cleaner.js';
import { validateBackendOutput } from './lib/validator.js';
import { printHeader, printDivider, validateNumericId } from './lib/cli.js';
import { TIMEOUTS } from './lib/constants.js';

loadEnvConfig(import.meta.url);
const config = getConfig(['AZURE_ORG', 'AZURE_PROJECT', 'AZURE_PAT', 'GROQ_API_KEY']);

const baseUrl = buildBaseUrl(config.AZURE_ORG, config.AZURE_PROJECT);
const authHeader = createAuthHeader(config.AZURE_PAT);

const COMPILE_PROMPT = `Extract the PRIMARY backend mutation from this user story. Output ONLY the spec, no intro text.
ALL OUTPUT MUST BE IN ENGLISH.

RULES:
- ONE mutation only (the main operation)
- BACKEND ONLY (database, API, business logic)
- IGNORE all UI (clicks, buttons, modals, display)
- C# types: Guid, string, int, bool
- Max 3 items per section
- MUST include AC section at the end

EXACT FORMAT (no deviations):

Mutation:
- Name: <PascalCase>
- Input: record <n>(Guid Field, string Field)
- Returns: record <n>(Guid Id, bool Success)

Behavior:
- <data operation 1>
- <data operation 2>

Rules:
- <business rule 1>
- <business rule 2>

AC: <list AC numbers this covers, e.g., 1, 2, 5>

MANDATORY: Always end with "AC:" followed by the acceptance criteria numbers covered.
NO intro text. NO code blocks. NO explanations. ONLY the spec above. ALL IN ENGLISH.`;

async function compileToSpec(story, retryCount = 0) {
  const userMessage = `${COMPILE_PROMPT}

Title: ${story.title}
Description: ${story.description}
Acceptance Criteria: ${story.acceptanceCriteria}`;

  const content = await callGroq(config.GROQ_API_KEY, {
    userPrompt: userMessage,
    maxTokens: 300,
    temperature: 0.05,
    timeoutMs: TIMEOUTS.LLM_SHORT
  });

  let result = cleanOutputBackend(content);
  const validation = validateBackendOutput(result);

  if (!validation.isValid) {
    if (validation.issues.length === 1 && validation.issues[0] === 'Missing "AC:" section') {
      result += '\n\nAC: (verify manually)';
    } else if (validation.issues.some(i => i.includes('truncated') || i.includes('incomplete')) && retryCount < 1) {
      console.log('  Incomplete output, retrying...');
      return compileToSpec(story, retryCount + 1);
    }
  }

  return { result, validation };
}

async function main() {
  const workItemId = process.argv[2];

  printHeader('US2CURSOR - Azure DevOps -> HotChocolate (Backend)');

  if (!workItemId) {
    console.log('  Usage: us2b <work-item-id>');
    console.log('');
    console.log('  Examples:');
    console.log('    us2b 12345');
    console.log('    us2b 67890');
    console.log('');
    console.log('  Stack: HotChocolate GraphQL (Backend only)');
    console.log('');
    process.exit(1);
  }

  const id = validateNumericId(workItemId, 'work item ID');

  try {
    console.log(`  Fetching US #${id} from Azure DevOps...`);
    const workItem = await getWorkItem(baseUrl, authHeader, id, TIMEOUTS.DEFAULT);
    const story = extractFields(workItem);

    console.log(`  "${story.title}"`);
    console.log('  Extracting backend spec with Groq (70B)...');
    console.log('');

    const { result: spec, validation } = await compileToSpec(story);

    try {
      clipboard.writeSync(spec);
      console.log('  Spec copied to clipboard!');
    } catch {
      console.log('  Clipboard unavailable. Output printed below.');
    }

    if (!validation.isValid) {
      console.log('');
      console.log('  Warnings:');
      validation.issues.forEach(issue => console.log(`     - ${issue}`));
    }

    console.log('');
    printDivider();
    console.log(spec);
    printDivider();
    console.log('');
    console.log('  Paste in Cursor Chat (Ctrl+V) and press Enter');
    console.log('');

  } catch (error) {
    console.error(`  Error: ${error.message}`);
    console.log('');
    console.log('  Possible causes:');
    console.log('    - Work Item does not exist');
    console.log('    - PAT expired or missing permissions');
    console.log('    - Incorrect project');
    console.log('    - Invalid Groq API Key');
    console.log('');
    process.exit(1);
  }
}

main();
