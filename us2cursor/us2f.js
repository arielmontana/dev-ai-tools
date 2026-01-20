#!/usr/bin/env node

import clipboard from 'clipboardy';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

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

// Validar configuración
if (!AZURE_ORG || !AZURE_PROJECT || !AZURE_PAT || !GROQ_API_KEY) {
  console.error('❌ Error: Missing environment variables in .env');
  console.error('   Required: AZURE_ORG, AZURE_PROJECT, AZURE_PAT, GROQ_API_KEY');
  process.exit(1);
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
  return {
    id: workItem.id,
    title: f['System.Title'] || '',
    description: (f['System.Description'] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    acceptanceCriteria: (f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n').trim()
  };
}

// === POST-PROCESSOR ===
function cleanOutput(text) {
  text = text.replace(/^(Here is|Here's|The following|Below is|I've extracted)[^\n]*\n*/gi, '');
  text = text.replace(/```[a-z]*\s*```/g, '');
  text = text.replace(/```[a-z]*\n?/gi, '');
  text = text.replace(/```/g, '');
  
  const BACKEND_KEYWORDS = [
    'database', 'sql', 'repository', 'entity framework', 'migration',
    'dbcontext', 'connection string', 'stored procedure'
  ];
  
  const lines = text.split('\n');
  const filtered = lines.filter(line => {
    const lower = line.toLowerCase();
    return !BACKEND_KEYWORDS.some(kw => lower.includes(kw));
  });
  
  return filtered.join('\n').trim();
}

// === OUTPUT VALIDATOR ===
function validateOutput(text) {
  const issues = [];
  
  if (!text.includes('Component:')) issues.push('Missing "Component:" section');
  if (!text.includes('- Name:')) issues.push('Missing "- Name:" in Component');
  if (!text.includes('UI Elements:') && !text.includes('Elements:')) issues.push('Missing "UI Elements:" section');
  if (!text.includes('Behavior:') && !text.includes('Interactions:')) issues.push('Missing "Behavior:" or "Interactions:" section');
  if (!text.includes('AC:')) issues.push('Missing "AC:" section');
  
  if (text.endsWith('-') || text.endsWith(':') || text.endsWith(',')) {
    issues.push('Output appears to be truncated');
  }
  
  return { isValid: issues.length === 0, issues };
}

// === GROQ COMPILER - FRONTEND ===
const COMPILE_PROMPT = `Extract the PRIMARY frontend component spec from this user story. Output ONLY the spec, no intro text.
ALL OUTPUT MUST BE IN ENGLISH.

RULES:
- ONE component only (the main one)
- FRONTEND ONLY (UI, interactions, display, styling)
- IGNORE all backend (database, API calls, business logic)
- Focus on: what user sees, clicks, interacts with
- Max 4 items per section
- MUST include AC section at the end

EXACT FORMAT (no deviations):

Component:
- Name: <PascalCase>Component
- Type: <modal|panel|button|list|form|card>
- Location: <where it appears in the app>

UI Elements:
- <element 1: description>
- <element 2: description>
- <element 3: description>

States:
- <state 1: when/condition>
- <state 2: when/condition>

Interactions:
- <user action 1> → <result>
- <user action 2> → <result>

Styling:
- <key style requirement from figma/design>

AC: <list AC numbers this covers, e.g., 1, 2, 4>

MANDATORY: Always end with "AC:" followed by the acceptance criteria numbers covered.
NO intro text. NO code blocks. NO explanations. ONLY the spec above. ALL IN ENGLISH.`;

async function compileToSpec(story, retryCount = 0) {
  const userMessage = `${COMPILE_PROMPT}

Title: ${story.title}
Description: ${story.description}
Acceptance Criteria: ${story.acceptanceCriteria}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 350,
      temperature: 0.05
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  let result = data.choices[0].message.content;
  
  result = cleanOutput(result);
  const validation = validateOutput(result);
  
  if (!validation.isValid) {
    if (validation.issues.length === 1 && validation.issues[0] === 'Missing "AC:" section') {
      result += '\n\nAC: (verify manually)';
    } else if (validation.issues.some(i => i.includes('truncated') || i.includes('incomplete')) && retryCount < 1) {
      console.log('  ⚠️  Incomplete output, retrying...');
      return compileToSpec(story, retryCount + 1);
    }
  }
  
  return { result, validation };
}

// === HELPERS ===
function printHeader() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   US2CURSOR - Azure DevOps → Frontend (UI/Components) ║');
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
    console.log('  Usage: us2f <work-item-id>');
    console.log('');
    console.log('  Examples:');
    console.log('    us2f 12345');
    console.log('    us2f 67890');
    console.log('');
    console.log('  Stack: Frontend (React/Angular/Vue components)');
    console.log('');
    process.exit(1);
  }

  try {
    console.log(`  🔍 Fetching US #${workItemId} from Azure DevOps...`);
    const workItem = await getWorkItem(workItemId);
    const story = extractFields(workItem);
    
    console.log(`  📋 "${story.title}"`);
    console.log(`  ⚙️  Extracting frontend spec with Groq (70B)...`);
    console.log('');
    
    const { result: spec, validation } = await compileToSpec(story);
    
    clipboard.writeSync(spec);
    
    console.log('  ✅ Spec copied to clipboard!');
    
    if (!validation.isValid) {
      console.log('');
      console.log('  ⚠️  Warnings:');
      validation.issues.forEach(issue => console.log(`     - ${issue}`));
    }
    
    console.log('');
    printDivider();
    console.log(spec);
    printDivider();
    console.log('');
    console.log('  👉 Paste in Cursor Chat (Ctrl+V) and press Enter');
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
