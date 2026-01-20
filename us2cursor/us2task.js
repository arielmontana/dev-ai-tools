#!/usr/bin/env node

import clipboard from 'clipboardy';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env first (defaults/template)
config({ path: join(__dirname, '.env') });

// Load .env.local second (overrides) - has priority
const localEnvPath = join(__dirname, '.env.local');
if (existsSync(localEnvPath)) {
  config({ path: localEnvPath, override: true });
}

const AZURE_ORG = process.env.AZURE_ORG;
const AZURE_PROJECT = process.env.AZURE_PROJECT;
const AZURE_PAT = process.env.AZURE_PAT;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const AZURE_USER_EMAIL = process.env.AZURE_USER_EMAIL || '';

if (!AZURE_ORG || !AZURE_PROJECT || !AZURE_PAT || !GROQ_API_KEY) {
  console.error('❌ Missing config. Create .env.local with: AZURE_ORG, AZURE_PROJECT, AZURE_PAT, GROQ_API_KEY');
  process.exit(1);
}

const authHeader = { 'Authorization': `Basic ${Buffer.from(':' + AZURE_PAT).toString('base64')}` };
const baseUrl = `https://dev.azure.com/${AZURE_ORG}/${encodeURIComponent(AZURE_PROJECT)}/_apis`;

function askQuestion(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

async function azGet(url) {
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function azPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${res.status}: ${err}`);
  }
  return res.json();
}

async function getWorkItem(id) {
  return azGet(`${baseUrl}/wit/workitems/${id}?$expand=relations&api-version=7.0`);
}

async function getCurrentUser() {
  // First check if user email is configured in .env.local
  if (AZURE_USER_EMAIL) {
    return AZURE_USER_EMAIL;
  }
  
  // Try to get user info from the API
  const url = `https://dev.azure.com/${AZURE_ORG}/_apis/connectionData?api-version=7.0`;
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) return null;
  const data = await res.json();
  
  // Try different properties to get a valid identifier
  const user = data.authenticatedUser;
  if (!user) return null;
  
  // Return email if available (preferred for AssignedTo)
  return user.properties?.Account?.$value || 
         user.providerDisplayName || 
         user.customDisplayName || 
         null;
}

function formatDescriptionAsHtml(description) {
  // Convert markdown list to HTML
  const lines = description.split('\n').filter(l => l.trim());
  const listItems = lines.map(line => {
    const text = line.replace(/^-\s*/, '').trim();
    return `<li>${text}</li>`;
  }).join('\n');
  
  return `<ul>\n${listItems}\n</ul>`;
}

async function createTask(title, description, parentId, assignedTo) {
  // Convert description to HTML format for Azure DevOps
  const htmlDescription = formatDescriptionAsHtml(description);
  
  const operations = [
    { op: 'add', path: '/fields/System.Title', value: title },
    { op: 'add', path: '/fields/System.Description', value: htmlDescription },
    {
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: `${baseUrl}/wit/workitems/${parentId}`,
        attributes: { comment: 'Parent User Story' }
      }
    }
  ];

  if (assignedTo) {
    operations.push({ op: 'add', path: '/fields/System.AssignedTo', value: assignedTo });
  }

  return azPost(`${baseUrl}/wit/workitems/$Task?api-version=7.0`, operations);
}

function extractUS(wi) {
  const f = wi.fields;
  return {
    id: wi.id,
    title: f['System.Title'] || '',
    description: (f['System.Description'] || '').replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n').trim(),
    ac: (f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n').trim()
  };
}

const PROMPT_BE = `Based on this User Story, generate a Backend Task.

OUTPUT FORMAT (strict):
Title: [BE] <concise task title in English, max 10 words>

Description:
- <technical task 1>
- <technical task 2>
- <technical task 3>
...

RULES:
- Title must start with [BE]
- Title should be specific and actionable
- Description: 5-10 technical tasks for backend development
- Tasks should include: endpoints, DTOs, validation, business logic, error handling, tests
- All in English
- No explanations, just the format above`;

const PROMPT_FE = `Based on this User Story, generate a Frontend Task.

OUTPUT FORMAT (strict):
Title: [FE] <concise task title in English, max 10 words>

Description:
- <technical task 1>
- <technical task 2>
- <technical task 3>
...

RULES:
- Title must start with [FE]
- Title should be specific and actionable
- Description: 5-10 technical tasks for frontend development
- Tasks should include: components, state management, UI elements, API integration, styling, tests
- All in English
- No explanations, just the format above`;

async function generateTask(us, type) {
  const prompt = type === 'be' ? PROMPT_BE : PROMPT_FE;
  const typeLabel = type === 'be' ? 'Backend' : 'Frontend';
  
  const usContext = `User Story #${us.id}: ${us.title}

Description:
${us.description}

Acceptance Criteria:
${us.ac}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: `You are a ${typeLabel} tech lead. Generate clear, actionable tasks.` },
        { role: 'user', content: `${prompt}\n\n${usContext}` }
      ],
      max_tokens: 800,
      temperature: 0.3
    })
  });

  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

function parseTaskOutput(output) {
  const lines = output.split('\n').map(l => l.trim()).filter(l => l);
  
  let title = '';
  const descriptionLines = [];
  let inDescription = false;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('title:')) {
      title = line.replace(/^title:\s*/i, '').trim();
    } else if (line.toLowerCase().startsWith('description:')) {
      inDescription = true;
    } else if (inDescription && line.startsWith('-')) {
      descriptionLines.push(line);
    }
  }

  const description = descriptionLines.join('\n');
  return { title, description };
}

function printHeader() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   US2TASK - Create Task from User Story               ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
}

async function main() {
  const usId = process.argv[2];
  const type = process.argv[3]?.toLowerCase();

  printHeader();

  if (!usId || !type || !['be', 'fe'].includes(type)) {
    console.log('  Usage: us2task <us-id> <be|fe>\n');
    console.log('  Creates a Task as child of the User Story.\n');
    console.log('  Arguments:');
    console.log('    us-id   User Story ID');
    console.log('    be      Backend task [BE]');
    console.log('    fe      Frontend task [FE]\n');
    console.log('  Example: us2task 199339 be\n');
    process.exit(1);
  }

  try {
    // 1. Fetch User Story
    console.log(`  🔍 Fetching US#${usId}...`);
    const wi = await getWorkItem(usId);
    
    const wiType = wi.fields['System.WorkItemType'];
    if (!['User Story', 'Product Backlog Item', 'Bug'].includes(wiType)) {
      console.error(`  ❌ Work item #${usId} is a ${wiType}, not a User Story/PBI/Bug`);
      process.exit(1);
    }

    const us = extractUS(wi);
    console.log(`  📋 "${us.title}"`);

    // 2. Get current user
    const currentUser = await getCurrentUser();
    if (currentUser) {
      console.log(`  👤 Will assign to: ${currentUser}`);
    }

    // 3. Generate task
    const typeLabel = type === 'be' ? 'BE' : 'FE';
    console.log(`\n  🤖 Generating ${typeLabel} task...\n`);
    
    const output = await generateTask(us, type);
    let { title, description } = parseTaskOutput(output);

    // 4. Show preview and ask for confirmation
    let confirmed = false;
    
    while (!confirmed) {
      console.log('─'.repeat(55));
      console.log(`\n  📝 Title: ${title}\n`);
      console.log('  📄 Description:');
      description.split('\n').forEach(line => console.log(`  ${line}`));
      console.log('\n' + '─'.repeat(55));

      const answer = await askQuestion('\n  ✏️  Create task? (y/n/edit): ');

      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        confirmed = true;
      } else if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
        console.log('\n  ❌ Cancelled.\n');
        process.exit(0);
      } else if (answer.toLowerCase() === 'edit') {
        const newTitle = await askQuestion(`\n  📝 New title (current: ${title}): `);
        if (newTitle.trim()) {
          // Ensure prefix is maintained
          if (!newTitle.startsWith('[BE]') && !newTitle.startsWith('[FE]')) {
            title = `[${typeLabel}] ${newTitle.trim()}`;
          } else {
            title = newTitle.trim();
          }
        }
        console.log('');
      } else {
        console.log('  ⚠️  Please answer y, n, or edit');
      }
    }

    // 5. Create task
    console.log('\n  📤 Creating task...');
    const task = await createTask(title, description, usId, currentUser);
    
    console.log(`\n  ✅ Task#${task.id} created!`);
    console.log(`  🔗 https://dev.azure.com/${AZURE_ORG}/${encodeURIComponent(AZURE_PROJECT)}/_workitems/edit/${task.id}\n`);

  } catch (e) {
    console.error(`\n  ❌ ${e.message}`);
    console.log('\n  Check: US exists, PAT has Work Items Read/Write\n');
    process.exit(1);
  }
}

main();
