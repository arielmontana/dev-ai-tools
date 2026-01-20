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
const AZURE_REPO = process.env.AZURE_REPO || '';

// Validar configuración
if (!AZURE_ORG || !AZURE_PROJECT || !AZURE_PAT || !GROQ_API_KEY) {
  console.error('❌ Error: Missing environment variables in .env');
  console.error('   Required: AZURE_ORG, AZURE_PROJECT, AZURE_PAT, GROQ_API_KEY');
  console.error('   Optional: AZURE_REPO (repository name)');
  process.exit(1);
}

// === AZURE DEVOPS - PULL REQUEST ===
async function getRepositories() {
  const url = `https://dev.azure.com/${AZURE_ORG}/${encodeURIComponent(AZURE_PROJECT)}/_apis/git/repositories?api-version=7.0`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${Buffer.from(':' + AZURE_PAT).toString('base64')}`
    }
  });

  if (!res.ok) {
    throw new Error(`Error fetching repositories: ${res.status} - Verify your PAT has Code > Read permissions`);
  }

  const data = await res.json();
  return data.value;
}

async function getPullRequest(repoId, prId) {
  const url = `https://dev.azure.com/${AZURE_ORG}/${encodeURIComponent(AZURE_PROJECT)}/_apis/git/repositories/${repoId}/pullrequests/${prId}?api-version=7.0`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${Buffer.from(':' + AZURE_PAT).toString('base64')}`
    }
  });

  if (!res.ok) {
    throw new Error(`Error fetching PR: ${res.status}`);
  }

  return res.json();
}

async function getPRComments(repoId, prId) {
  const url = `https://dev.azure.com/${AZURE_ORG}/${encodeURIComponent(AZURE_PROJECT)}/_apis/git/repositories/${repoId}/pullrequests/${prId}/threads?api-version=7.0`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${Buffer.from(':' + AZURE_PAT).toString('base64')}`
    }
  });

  if (!res.ok) {
    throw new Error(`Error fetching comments: ${res.status}`);
  }

  const data = await res.json();
  return data.value;
}

function extractPendingComments(threads) {
  const comments = [];
  
  for (const thread of threads) {
    if (thread.isDeleted) continue;
    if (thread.status === 'fixed' || thread.status === 'closed') continue;
    
    const threadContext = thread.threadContext;
    const filePath = threadContext?.filePath || null;
    const lineNumber = threadContext?.rightFileStart?.line || threadContext?.leftFileStart?.line || null;
    
    for (const comment of thread.comments || []) {
      if (comment.commentType === 'system') continue;
      if (!comment.content) continue;
      
      comments.push({
        file: filePath,
        line: lineNumber,
        comment: comment.content.replace(/\n/g, ' ').trim()
      });
    }
  }
  
  return comments;
}

// === GROQ - GENERATE MINIMAL PROMPT ===
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

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 300,
      temperature: 0.05
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
  console.log('║   US2PR - Optimized prompt from PR comments           ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
}

function printDivider() {
  console.log('─'.repeat(55));
}

// === MAIN ===
async function main() {
  const prId = process.argv[2];
  const repoNameArg = process.argv[3];

  printHeader();

  if (!prId) {
    console.log('  Usage: us2pr <pull-request-id> [repo-name]');
    console.log('');
    console.log('  Examples:');
    console.log('    us2pr 123');
    console.log('    us2pr 123 MyRepo');
    console.log('');
    console.log('  Generates optimized prompt for Cursor from');
    console.log('  pending PR comments.');
    console.log('');
    process.exit(1);
  }

  try {
    console.log(`  🔍 Fetching repository...`);
    const repos = await getRepositories();
    
    let repo;
    const repoName = repoNameArg || AZURE_REPO;
    
    if (repoName) {
      repo = repos.find(r => r.name.toLowerCase() === repoName.toLowerCase());
      if (!repo) {
        console.error(`  ❌ Repository "${repoName}" not found`);
        console.log('');
        console.log('  Available repositories:');
        repos.forEach(r => console.log(`    - ${r.name}`));
        process.exit(1);
      }
    } else {
      repo = repos[0];
    }
    console.log(`  📦 Repo: ${repo.name}`);

    console.log(`  🔍 Fetching PR #${prId}...`);
    const pr = await getPullRequest(repo.id, prId);
    console.log(`  📋 "${pr.title}"`);
    
    console.log(`  💬 Fetching comments...`);
    const threads = await getPRComments(repo.id, prId);
    const pendingComments = extractPendingComments(threads);
    
    console.log(`  📝 Pending comments: ${pendingComments.length}`);
    
    if (pendingComments.length === 0) {
      console.log('');
      console.log('  ✅ No pending comments. All resolved!');
      console.log('');
      process.exit(0);
    }
    
    console.log(`  ⚙️  Generating optimized prompt...`);
    console.log('');
    
    const prompt = await generateMinimalPrompt(pendingComments);
    
    clipboard.writeSync(prompt);
    
    printDivider();
    console.log(prompt);
    printDivider();
    console.log('');
    console.log('  ✅ Prompt copied to clipboard!');
    console.log('  👉 Paste in Cursor (Ctrl+V) and press Enter');
    console.log('');
    
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    console.log('');
    console.log('  Possible causes:');
    console.log('    - PR does not exist');
    console.log('    - PAT missing Code > Read permissions');
    console.log('    - Incorrect repository');
    console.log('');
    console.log('  To add PAT permissions:');
    console.log('    1. Go to Azure DevOps → User Settings → Personal Access Tokens');
    console.log('    2. Edit token → Add Code > Read');
    console.log('');
    process.exit(1);
  }
}

main();
