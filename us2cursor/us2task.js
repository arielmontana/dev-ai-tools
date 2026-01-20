#!/usr/bin/env node

import clipboard from 'clipboardy';
import { loadEnvConfig, getConfig } from './lib/config.js';
import { createAuthHeader, buildBaseUrl, getWorkItemWithRelations, extractUS } from './lib/azure.js';
import { httpGet } from './lib/http.js';
import { callGroq } from './lib/llm.js';
import { askQuestion, printHeader, printDivider } from './lib/cli.js';
import { PARENT_WORK_ITEM_TYPES, TIMEOUTS } from './lib/constants.js';

loadEnvConfig(import.meta.url);
const config = getConfig(
  ['AZURE_ORG', 'AZURE_PROJECT', 'AZURE_PAT', 'GROQ_API_KEY'],
  ['AZURE_USER_EMAIL']
);

const baseUrl = buildBaseUrl(config.AZURE_ORG, config.AZURE_PROJECT);
const authHeader = createAuthHeader(config.AZURE_PAT);

async function getCurrentUser() {
  if (config.AZURE_USER_EMAIL) {
    return config.AZURE_USER_EMAIL;
  }

  try {
    const url = `https://dev.azure.com/${config.AZURE_ORG}/_apis/connectionData?api-version=7.0`;
    const data = await httpGet(url, authHeader, TIMEOUTS.DEFAULT);
    const user = data.authenticatedUser;
    if (!user) return null;

    return user.properties?.Account?.$value ||
           user.providerDisplayName ||
           user.customDisplayName ||
           null;
  } catch {
    return null;
  }
}

function formatDescriptionAsHtml(description) {
  const lines = description.split('\n').filter(l => l.trim());
  const listItems = lines.map(line => {
    const text = line.replace(/^-\s*/, '').trim();
    return `<li>${text}</li>`;
  }).join('\n');

  return `<ul>\n${listItems}\n</ul>`;
}

async function createTask(title, description, parentId, assignedTo) {
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

  // Azure DevOps requires json-patch+json for work item creation
  const res = await fetch(`${baseUrl}/wit/workitems/$Task?api-version=7.0`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify(operations)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${res.status}: ${err}`);
  }
  return res.json();
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

  return callGroq(config.GROQ_API_KEY, {
    systemPrompt: `You are a ${typeLabel} tech lead. Generate clear, actionable tasks.`,
    userPrompt: `${prompt}\n\n${usContext}`,
    maxTokens: 800,
    temperature: 0.3,
    timeoutMs: TIMEOUTS.LLM_SHORT
  });
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

async function main() {
  const usId = process.argv[2];
  const type = process.argv[3]?.toLowerCase();

  printHeader('US2TASK - Create Task from User Story');

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
    console.log(`  Fetching US#${usId}...`);
    const wi = await getWorkItemWithRelations(baseUrl, authHeader, usId, TIMEOUTS.DEFAULT);

    if (!wi) {
      console.error(`  Error: Work item #${usId} not found`);
      process.exit(1);
    }

    const wiType = wi.fields['System.WorkItemType'];
    if (!PARENT_WORK_ITEM_TYPES.includes(wiType)) {
      console.error(`  Error: Work item #${usId} is a ${wiType}, not a User Story/PBI/Bug`);
      process.exit(1);
    }

    const us = extractUS(wi);
    console.log(`  "${us.title}"`);

    // 2. Get current user
    const currentUser = await getCurrentUser();
    if (currentUser) {
      console.log(`  Will assign to: ${currentUser}`);
    }

    // 3. Generate task
    const typeLabel = type === 'be' ? 'BE' : 'FE';
    console.log(`\n  Generating ${typeLabel} task...\n`);

    const output = await generateTask(us, type);
    let { title, description } = parseTaskOutput(output);

    // 4. Show preview and ask for confirmation
    let confirmed = false;

    while (!confirmed) {
      printDivider();
      console.log(`\n  Title: ${title}\n`);
      console.log('  Description:');
      description.split('\n').forEach(line => console.log(`  ${line}`));
      console.log('\n');
      printDivider();

      const answer = await askQuestion('\n  Create task? (y/n/edit): ');

      if (answer === 'y' || answer === 'yes') {
        confirmed = true;
      } else if (answer === 'n' || answer === 'no') {
        console.log('\n  Cancelled.\n');
        process.exit(0);
      } else if (answer === 'edit') {
        const newTitle = await askQuestion(`\n  New title (current: ${title}): `);
        if (newTitle.trim()) {
          if (!newTitle.startsWith('[BE]') && !newTitle.startsWith('[FE]')) {
            title = `[${typeLabel}] ${newTitle.trim()}`;
          } else {
            title = newTitle.trim();
          }
        }
        console.log('');
      } else {
        console.log('  Please answer y, n, or edit');
      }
    }

    // 5. Create task
    console.log('\n  Creating task...');
    const task = await createTask(title, description, usId, currentUser);

    console.log(`\n  Task#${task.id} created!`);
    console.log(`  https://dev.azure.com/${config.AZURE_ORG}/${encodeURIComponent(config.AZURE_PROJECT)}/_workitems/edit/${task.id}\n`);

  } catch (e) {
    console.error(`\n  ${e.message}`);
    console.log('\n  Check: US exists, PAT has Work Items Read/Write\n');
    process.exit(1);
  }
}

main();
