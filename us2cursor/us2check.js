#!/usr/bin/env node

import clipboard from 'clipboardy';
import { loadEnvConfig, getConfig } from './lib/config.js';
import { createAuthHeader, buildBaseUrl, getWorkItem } from './lib/azure.js';
import { callGroq } from './lib/llm.js';
import { fetchFigmaContent, isFigmaUrl } from './lib/figma.js';
import { askQuestion, printHeader, printDivider, validateNumericId } from './lib/cli.js';
import { TIMEOUTS } from './lib/constants.js';

loadEnvConfig(import.meta.url);
const config = getConfig(
  ['AZURE_ORG', 'AZURE_PROJECT', 'AZURE_PAT', 'GROQ_API_KEY'],
  ['FIGMA_PAT']
);

const baseUrl = buildBaseUrl(config.AZURE_ORG, config.AZURE_PROJECT);
const authHeader = createAuthHeader(config.AZURE_PAT);

/**
 * Extract fields from work item with enhanced HTML parsing
 * Preserves section structure for better analysis
 */
function extractFieldsEnhanced(workItem) {
  const f = workItem.fields || {};

  let rawDesc = f['System.Description'] || '';
  rawDesc = rawDesc.replace(/<\/(div|p|br|h[1-6]|li|ul|ol)>/gi, '\n');
  rawDesc = rawDesc.replace(/<(br|hr)\s*\/?>/gi, '\n');
  rawDesc = rawDesc.replace(/<[^>]*>/g, '');
  rawDesc = rawDesc.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  rawDesc = rawDesc.replace(/\n{3,}/g, '\n\n').trim();

  return {
    id: workItem.id,
    title: f['System.Title'] || '',
    description: rawDesc,
    acceptanceCriteria: (f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n').trim()
  };
}

const VALIDATE_PROMPT = `You are a senior requirements analyst. Analyze this User Story and determine if it's complete for development.
ALL OUTPUT MUST BE IN ENGLISH.

ANALYZE:
1. **Description**: Is it clear? Missing context? Ambiguities?
2. **Acceptance Criteria**: Do they cover all cases? Missing scenarios?
3. **Edge Cases**: What about errors, empty states, limits?
4. **Validations**: Are data validation rules specified?
5. **Permissions**: Is it defined who can do what?
6. **Figma Consistency**: Do ACs cover all screen elements?

FIGMA CONTEXT:
{FIGMA_CONTEXT}

OUTPUT FORMAT (exact):

## Status: [COMPLETE | INCOMPLETE | NEEDS REVIEW]

## Description
- Done: Well-defined aspects
- Missing: Missing or ambiguous aspects

## Acceptance Criteria
- Covered: Covered cases
- Not covered: NOT covered cases (list)

## Suggested ACs to add
1. AC#X: [description of missing AC]
2. AC#X: [description of missing AC]

## Missing validations
- [list of unspecified validations]

## Edge cases not covered
- [list of edge cases]

## Questions for Product Owner
1. [important question]
2. [important question]

## Summary
[1-2 sentences with overall status and correction priority]`;

async function validateUserStory(story, figmaContext) {
  const prompt = VALIDATE_PROMPT.replace('{FIGMA_CONTEXT}', figmaContext || 'No Figma context provided');

  const userMessage = `${prompt}

USER STORY:
Title: ${story.title}

Description:
${story.description || '(No description)'}

Acceptance Criteria:
${story.acceptanceCriteria || '(No acceptance criteria)'}`;

  return callGroq(config.GROQ_API_KEY, {
    userPrompt: userMessage,
    maxTokens: 1500,
    temperature: 0.2,
    timeoutMs: TIMEOUTS.LLM_LONG
  });
}

async function main() {
  const workItemId = process.argv[2];

  printHeader('US2VALIDATE - Validate User Story completeness');

  if (!workItemId) {
    console.log('  Usage: us2check <work-item-id>');
    console.log('');
    console.log('  Examples:');
    console.log('    us2check 12345');
    console.log('    us2check 67890');
    console.log('');
    console.log('  Function: Validates if a User Story is complete');
    console.log('            and suggests missing ACs');
    console.log('');
    process.exit(1);
  }

  const id = validateNumericId(workItemId, 'work item ID');

  try {
    console.log(`  Fetching US #${id} from Azure DevOps...`);
    const workItem = await getWorkItem(baseUrl, authHeader, id, TIMEOUTS.DEFAULT);
    const story = extractFieldsEnhanced(workItem);

    console.log(`  "${story.title}"`);
    console.log('');
    printDivider();

    console.log('');
    console.log('  FIGMA CONTEXT (optional)');
    console.log('');
    console.log('  You can provide Figma links or descriptions.');
    if (config.FIGMA_PAT) {
      console.log('  FIGMA_PAT detected - URLs will be fetched automatically');
    } else {
      console.log('  No FIGMA_PAT - URLs will be passed as-is');
    }
    console.log('  Press Enter after each one. Empty line to finish.');
    console.log('');

    let figmaContext = '';
    try {
      const figmaInputs = [];
      let figmaIndex = 1;
      while (true) {
        const input = await askQuestion(`  Figma #${figmaIndex}: `);
        if (!input) break;

        if (isFigmaUrl(input)) {
          console.log('     Fetching Figma content...');
          const result = await fetchFigmaContent(input, config.FIGMA_PAT);
          if (result.success) {
            console.log('     Extracted content from Figma');
            figmaInputs.push(`[Screen ${figmaIndex}]\nURL: ${input}\n${result.summary}`);
          } else {
            console.log(`     ${result.error} - using URL as description`);
            figmaInputs.push(`[Screen ${figmaIndex}] ${result.fallback}`);
          }
        } else {
          figmaInputs.push(`[Screen ${figmaIndex}] ${input}`);
        }
        figmaIndex++;
      }
      figmaContext = figmaInputs.join('\n\n');
    } catch {
      console.log('  Could not read Figma input, continuing without it...');
    }

    console.log('');
    console.log('  Analyzing User Story with Groq (70B)...');
    console.log('');

    const validation = await validateUserStory(story, figmaContext);

    try {
      clipboard.writeSync(validation);
      console.log('  Analysis completed! (copied to clipboard)');
    } catch {
      console.log('  Analysis completed!');
      console.log('  Clipboard unavailable. Output printed below.');
    }

    console.log('');
    printDivider();
    console.log('');
    console.log(validation);
    console.log('');
    printDivider();
    console.log('');
    console.log('  Tip: Copy suggested ACs to Product Owner');
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
