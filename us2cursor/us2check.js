#!/usr/bin/env node

import clipboard from 'clipboardy';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import * as readline from 'readline';
import { fetchFigmaContent, isFigmaUrl } from './lib/figma.js';

// Cargar .env desde el directorio del script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env first (defaults/template)
config({ path: join(__dirname, '.env') });

// Load .env.local second (overrides) - has priority
const localEnvPath = join(__dirname, '.env.local');
if (existsSync(localEnvPath)) {
  config({ path: localEnvPath, override: true });
}

// === CONFIGURACIÓN ===
const AZURE_ORG = process.env.AZURE_ORG;
const AZURE_PROJECT = process.env.AZURE_PROJECT;
const AZURE_PAT = process.env.AZURE_PAT;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const FIGMA_PAT = process.env.FIGMA_PAT; // Optional - for fetching Figma content

// Validar configuración
if (!AZURE_ORG || !AZURE_PROJECT || !AZURE_PAT || !GROQ_API_KEY) {
  console.error('❌ Error: Missing environment variables in .env');
  console.error('   Required: AZURE_ORG, AZURE_PROJECT, AZURE_PAT, GROQ_API_KEY');
  console.error('   Optional: FIGMA_PAT (for fetching Figma file content)');
  process.exit(1);
}

// === READLINE HELPER ===
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// === AZURE DEVOPS ===
async function getWorkItem(id) {
  const url = `https://dev.azure.com/${AZURE_ORG}/${encodeURIComponent(AZURE_PROJECT)}/_apis/wit/workitems/${id}?api-version=7.0`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${Buffer.from(':' + AZURE_PAT).toString('base64')}`
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error ${res.status}: ${res.statusText}\n${errorText}`);
  }

  return res.json();
}

function extractFields(workItem) {
  const f = workItem.fields;

  // Parse description preserving section structure
  let rawDesc = f['System.Description'] || '';
  // Replace block-level tags with newlines to preserve sections
  rawDesc = rawDesc.replace(/<\/(div|p|br|h[1-6]|li|ul|ol)>/gi, '\n');
  rawDesc = rawDesc.replace(/<(br|hr)\s*\/?>/gi, '\n');
  // Remove remaining HTML tags
  rawDesc = rawDesc.replace(/<[^>]*>/g, '');
  // Decode HTML entities
  rawDesc = rawDesc.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  // Clean up multiple newlines but preserve structure
  rawDesc = rawDesc.replace(/\n{3,}/g, '\n\n').trim();

  return {
    id: workItem.id,
    title: f['System.Title'] || '',
    description: rawDesc,
    acceptanceCriteria: (f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n').trim()
  };
}

// === GROQ VALIDATOR ===
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
- ✅ Well-defined aspects
- ❌ Missing or ambiguous aspects

## Acceptance Criteria
- ✅ Covered cases
- ❌ NOT covered cases (list)

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

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1500,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// === HELPERS ===
function printHeader() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   US2VALIDATE - Validate User Story completeness      ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
}

function printDivider() {
  console.log('─'.repeat(55));
}

// === MAIN ===
async function main() {
  const workItemId = process.argv[2];

  printHeader();

  if (!workItemId) {
    console.log('  Usage: us2validate <work-item-id>');
    console.log('');
    console.log('  Examples:');
    console.log('    us2validate 12345');
    console.log('    us2validate 67890');
    console.log('');
    console.log('  Function: Validates if a User Story is complete');
    console.log('            and suggests missing ACs');
    console.log('');
    process.exit(1);
  }

  try {
    console.log(`  🔍 Fetching US #${workItemId} from Azure DevOps...`);
    const workItem = await getWorkItem(workItemId);
    const story = extractFields(workItem);
    
    console.log(`  📋 "${story.title}"`);
    console.log('');
    printDivider();
    
    // Ask for Figma context (supports multiple)
    console.log('');
    console.log('  📐 FIGMA CONTEXT (optional)');
    console.log('');
    console.log('  You can provide Figma links or descriptions.');
    if (FIGMA_PAT) {
      console.log('  ✓ FIGMA_PAT detected - URLs will be fetched automatically');
    } else {
      console.log('  ℹ No FIGMA_PAT - URLs will be passed as-is');
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

        // Check if input is a Figma URL
        if (isFigmaUrl(input)) {
          console.log(`     ↳ Fetching Figma content...`);
          const result = await fetchFigmaContent(input, FIGMA_PAT);
          if (result.success) {
            console.log(`     ✓ Extracted content from Figma`);
            figmaInputs.push(`[Screen ${figmaIndex}]\nURL: ${input}\n${result.summary}`);
          } else {
            console.log(`     ⚠️  ${result.error} - using URL as description`);
            figmaInputs.push(`[Screen ${figmaIndex}] ${result.fallback}`);
          }
        } else {
          figmaInputs.push(`[Screen ${figmaIndex}] ${input}`);
        }
        figmaIndex++;
      }
      figmaContext = figmaInputs.join('\n\n');
    } catch (err) {
      console.log('  ⚠️  Could not read Figma input, continuing without it...');
    }
    
    console.log('');
    console.log(`  ⚙️  Analyzing User Story with Groq (70B)...`);
    console.log('');
    
    const validation = await validateUserStory(story, figmaContext);
    
    clipboard.writeSync(validation);
    
    console.log('  ✅ Analysis completed! (copied to clipboard)');
    console.log('');
    printDivider();
    console.log('');
    console.log(validation);
    console.log('');
    printDivider();
    console.log('');
    console.log('  💡 Tip: Copy suggested ACs to Product Owner');
    console.log('');
    
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
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
