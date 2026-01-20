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
const AZURE_REPO = process.env.AZURE_REPO || '';

if (!AZURE_ORG || !AZURE_PROJECT || !AZURE_PAT || !GROQ_API_KEY) {
  console.error('❌ Missing config. Create .env.local with: AZURE_ORG, AZURE_PROJECT, AZURE_PAT, GROQ_API_KEY');
  process.exit(1);
}

function askQuestion(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim().toLowerCase()); }));
}

const authHeader = { 'Authorization': `Basic ${Buffer.from(':' + AZURE_PAT).toString('base64')}` };

async function azGet(url) {
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function azGetText(url) {
  const res = await fetch(url, { headers: authHeader });
  return res.ok ? res.text() : null;
}

async function azPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${res.status}: ${err}`);
  }
  return res.json();
}

const baseUrl = `https://dev.azure.com/${AZURE_ORG}/${encodeURIComponent(AZURE_PROJECT)}/_apis`;

async function getRepos() { return (await azGet(`${baseUrl}/git/repositories?api-version=7.0`)).value; }
async function getPR(repoId, prId) { return azGet(`${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}?api-version=7.0`); }
async function getPRWorkItems(repoId, prId) { 
  try { return (await azGet(`${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/workitems?api-version=7.0`)).value || []; } 
  catch { return []; }
}
async function getWorkItem(id) { 
  try { return azGet(`${baseUrl}/wit/workitems/${id}?api-version=7.0`); } 
  catch { return null; }
}
async function getPRIterations(repoId, prId) { return (await azGet(`${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/iterations?api-version=7.0`)).value; }
async function getPRChanges(repoId, prId, iterId) { return (await azGet(`${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/iterations/${iterId}/changes?api-version=7.0`)).changeEntries || []; }

async function getFileAtCommit(repoId, commitId, path) {
  const url = `${baseUrl}/git/repositories/${repoId}/items?path=${encodeURIComponent(path)}&versionType=Commit&version=${commitId}&api-version=7.0`;
  return azGetText(url);
}

// Post general comment (not on a specific line)
async function postGeneralComment(repoId, prId, content) { 
  return azPost(`${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/threads?api-version=7.0`, { 
    comments: [{ parentCommentId: 0, content, commentType: 1 }], 
    status: 1 
  }); 
}

// Post comment on a specific line in a file
async function postLineComment(repoId, prId, filePath, line, content, iterationId, changeTrackingId) {
  const body = {
    comments: [{ 
      parentCommentId: 0, 
      content, 
      commentType: 1 
    }],
    status: 1,
    threadContext: {
      filePath: filePath,
      rightFileStart: { line: line, offset: 1 },
      rightFileEnd: { line: line, offset: 1 }
    },
    pullRequestThreadContext: {
      iterationContext: {
        firstComparingIteration: iterationId,
        secondComparingIteration: iterationId
      },
      changeTrackingId: changeTrackingId
    }
  };
  
  return azPost(`${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/threads?api-version=7.0`, body);
}

function extractUS(wi) {
  const f = wi.fields;
  return {
    id: wi.id,
    title: f['System.Title'] || '',
    ac: (f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n').trim()
  };
}

function extractChangedLines(oldContent, newContent, maxContext = 3) {
  if (!oldContent) {
    const lines = newContent.split('\n').slice(0, 150);
    return lines.map((l, i) => `+${i + 1}|${l}`).join('\n');
  }
  
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const changes = [];
  const changedLineNumbers = new Set();
  
  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    if (oldLines[i] !== newLines[i]) {
      changedLineNumbers.add(i);
      for (let ctx = Math.max(0, i - maxContext); ctx <= Math.min(newLines.length - 1, i + maxContext); ctx++) {
        changedLineNumbers.add(ctx);
      }
    }
  }
  
  const sortedLines = Array.from(changedLineNumbers).sort((a, b) => a - b);
  let lastLine = -10;
  
  for (const lineNum of sortedLines) {
    if (lineNum > lastLine + 1 && changes.length > 0) {
      changes.push('...');
    }
    
    const lineContent = newLines[lineNum] || '';
    const isNew = oldLines[lineNum] !== newLines[lineNum];
    const prefix = isNew ? '+' : ' ';
    changes.push(`${prefix}${lineNum + 1}|${lineContent}`);
    lastLine = lineNum;
  }
  
  return changes.slice(0, 100).join('\n');
}

// Parse review output to extract issues from table format
function parseReviewIssues(reviewText) {
  const issues = [];
  
  // Match table rows: | 🔴 CRITICAL | Bugs | Query.cs | 45 | issue | fix |
  const tableRowRegex = /\|\s*(🔴 CRITICAL|🟡 IMPORTANT|🔵 MINOR)\s*\|\s*(\w+)\s*\|\s*([^\|]+\.(?:cs|js|ts|tsx|jsx|py|java|go))\s*\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|/g;
  
  let match;
  while ((match = tableRowRegex.exec(reviewText)) !== null) {
    issues.push({
      severity: match[1].trim(),
      category: match[2].trim(),
      fileName: match[3].trim(),
      line: parseInt(match[4], 10),
      issue: match[5].trim(),
      fix: match[6].trim()
    });
  }
  
  return issues;
}

// Find the file path and change tracking ID for a given file name
function findFileInfo(changes, fileName) {
  for (const change of changes) {
    const path = change.item?.path || '';
    if (path.endsWith(fileName) || path.includes(fileName)) {
      return {
        path: path,
        changeTrackingId: change.changeTrackingId
      };
    }
  }
  return null;
}

const PROMPT_WITH_US = `Output a code review with the EXACT structure below.

Review only + lines. Be concise.

CLASSIFICATION:
- 🔴 CRITICAL: Bugs, Security
- 🟡 IMPORTANT: Performance, CleanCode
- 🔵 MINOR: BestPractices

VERDICT:
- Any 🔴 → REQUEST CHANGES
- Any 🟡 → APPROVE WITH COMMENTS
- Only 🔵 or nothing → APPROVE

RULES:
- File column: ONLY filename (e.g. "Query.cs"), NOT full path
- Do NOT repeat the input files or CHANGES section in your output
- Output ONLY the review structure below, nothing else

---
OUTPUT STRUCTURE:
---

## Code Review

### ✅ Good
- [positive point]

### 📋 Issues

| Severity | Category | File | Line | Issue | Fix |
|----------|----------|------|------|-------|-----|
| 🔴 CRITICAL | Bugs | Query.cs | 45 | [brief] | [brief] |
| 🟡 IMPORTANT | Performance | Mutation.cs | 120 | [brief] | [brief] |
| 🔵 MINOR | CleanCode | Service.cs | 30 | [brief] | [brief] |

*(If no issues, write "No issues found" instead of table)*

### 🧪 Missing Tests
- Class.Method

*(If no missing tests, write "None")*

### 📋 AC Coverage

| AC | Status | Where |
|----|--------|-------|
| 1 | ✅ | Class.Method |
| 2 | ❌ | Not implemented |

### 📝 Verdict
**APPROVE**

---
*prreview*`;

const PROMPT_NO_US = `Output a code review with the EXACT structure below.

Review only + lines. Be concise.

CLASSIFICATION:
- 🔴 CRITICAL: Bugs, Security
- 🟡 IMPORTANT: Performance, CleanCode
- 🔵 MINOR: BestPractices

VERDICT:
- Any 🔴 → REQUEST CHANGES
- Any 🟡 → APPROVE WITH COMMENTS
- Only 🔵 or nothing → APPROVE

RULES:
- File column: ONLY filename (e.g. "Query.cs"), NOT full path
- Do NOT repeat the input files or CHANGES section in your output
- Output ONLY the review structure below, nothing else

---
OUTPUT STRUCTURE:
---

## Code Review

### ✅ Good
- [positive point]

### 📋 Issues

| Severity | Category | File | Line | Issue | Fix |
|----------|----------|------|------|-------|-----|
| 🔴 CRITICAL | Bugs | Query.cs | 45 | [brief] | [brief] |
| 🟡 IMPORTANT | Performance | Mutation.cs | 120 | [brief] | [brief] |
| 🔵 MINOR | CleanCode | Service.cs | 30 | [brief] | [brief] |

*(If no issues, write "No issues found" instead of table)*

### 🧪 Missing Tests
- Class.Method

*(If no missing tests, write "None")*

### 📝 Verdict
**APPROVE**

---
*prreview*
⚠️ No US linked`;

async function review(prTitle, files, us) {
  const prompt = us ? PROMPT_WITH_US : PROMPT_NO_US;
  const usContext = us ? `\nUS#${us.id}: ${us.title}\nAC:\n${us.ac}` : '';
  
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { 
          role: 'system', 
          content: 'You are a code reviewer. You MUST follow the exact output structure provided. Never skip sections. Always include all headers even if empty.' 
        },
        { 
          role: 'user', 
          content: `${prompt}${usContext}\n\nPR: ${prTitle}\n\nCHANGES:\n${files}` 
        }
      ],
      max_tokens: 1800,
      temperature: 0.1
    })
  });

  if (!res.ok) throw new Error(`Groq ${res.status}`);
  return (await res.json()).choices[0].message.content;
}

function printHeader() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   PRREVIEW - AI Code Review (Changes Only)            ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
}

async function main() {
  const prId = process.argv[2];
  const repoArg = process.argv[3];

  printHeader();

  if (!prId) {
    console.log('  Usage: prreview <pr-id> [repo]\n');
    console.log('  Reviews ONLY the changes in the PR.');
    console.log('  CRITICAL (bugs/security) > IMPORTANT (perf/clean) > MINOR (tests/practices)\n');
    process.exit(1);
  }

  try {
    console.log('  🔍 Fetching PR...');
    const repos = await getRepos();
    const repo = (repoArg || AZURE_REPO) 
      ? repos.find(r => r.name.toLowerCase() === (repoArg || AZURE_REPO).toLowerCase())
      : repos[0];
    
    if (!repo) {
      console.error(`  ❌ Repo not found. Available: ${repos.map(r => r.name).join(', ')}`);
      process.exit(1);
    }
    console.log(`  📦 ${repo.name}`);

    const pr = await getPR(repo.id, prId);
    console.log(`  📋 "${pr.title}"`);
    console.log(`  👤 ${pr.createdBy?.displayName || 'Unknown'}`);
    
    const sourceCommit = pr.lastMergeSourceCommit?.commitId;
    const targetCommit = pr.lastMergeTargetCommit?.commitId;
    
    let us = null;
    const wis = await getPRWorkItems(repo.id, prId);
    for (const item of wis) {
      const wiId = item.id || item.url?.split('/').pop();
      if (wiId) {
        const wi = await getWorkItem(wiId);
        if (wi && ['User Story', 'Product Backlog Item', 'Bug'].includes(wi.fields['System.WorkItemType'])) {
          us = extractUS(wi);
          console.log(`  📝 US#${us.id}: "${us.title}"`);
          break;
        }
      }
    }
    if (!us) console.log('  ⚠️  No US linked');
    
    console.log('  📂 Getting changes...');
    const iters = await getPRIterations(repo.id, prId);
    const latestIteration = iters[iters.length - 1];
    const iterationId = latestIteration.id;
    const changes = await getPRChanges(repo.id, prId, iterationId);
    
    const codeExts = ['.cs', '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go'];
    const codeFiles = changes.filter(c => {
      const p = c.item?.path || '';
      return codeExts.some(e => p.endsWith(e)) && c.changeType !== 'delete';
    });
    
    console.log(`  📝 ${codeFiles.length} files changed`);
    
    if (!codeFiles.length) {
      console.log('\n  ⚠️  No code files.\n');
      process.exit(0);
    }
    
    console.log('  🔄 Extracting diffs...');
    let diffContent = '';
    let addedLines = 0;
    
    for (const c of codeFiles.slice(0, 8)) {
      const path = c.item?.path;
      if (!path) continue;
      
      const changeType = c.changeType;
      const newContent = await getFileAtCommit(repo.id, sourceCommit, path);
      if (!newContent) continue;
      
      let fileDiff;
      if (changeType === 'add') {
        const lines = newContent.split('\n').slice(0, 100);
        fileDiff = lines.map((l, i) => `+${i + 1}|${l}`).join('\n');
        addedLines += lines.length;
      } else {
        const oldContent = await getFileAtCommit(repo.id, targetCommit, path);
        fileDiff = extractChangedLines(oldContent, newContent, 3);
        addedLines += (fileDiff.match(/^\+/gm) || []).length;
      }
      
      if (fileDiff) {
        diffContent += `\n### ${path}\n\`\`\`\n${fileDiff}\n\`\`\`\n`;
      }
    }
    
    console.log(`  ➕ ~${addedLines} lines changed`);
    
    if (!diffContent.trim()) {
      console.log('\n  ⚠️  No significant changes found.\n');
      process.exit(0);
    }
    
    console.log('  🤖 Reviewing...\n');
    const result = await review(pr.title, diffContent, us);
    
    clipboard.writeSync(result);
    
    console.log('─'.repeat(55));
    console.log('\n' + result + '\n');
    console.log('─'.repeat(55));
    console.log('\n  ✅ Copied to clipboard!\n');
    
    // Parse issues from review
    const issues = parseReviewIssues(result);
    
    const answer = await askQuestion('  📤 Publish to PR? (y/n): ');
    
    if (answer === 'y' || answer === 'yes') {
      console.log('\n  📤 Publishing...');
      
      // 1. Post general comment with full review
      console.log('  📝 Posting general review...');
      await postGeneralComment(repo.id, prId, result);
      
      // 2. Post individual comments on each line
      if (issues.length > 0) {
        console.log(`  📍 Posting ${issues.length} line comments...`);
        
        for (const issue of issues) {
          const fileInfo = findFileInfo(changes, issue.fileName);
          
          if (fileInfo) {
            const commentContent = `**${issue.severity}** - ${issue.category}\n\n**Issue:** ${issue.issue}\n\n**Fix:** ${issue.fix}\n\n---\n*prreview*`;
            
            try {
              await postLineComment(
                repo.id, 
                prId, 
                fileInfo.path, 
                issue.line, 
                commentContent,
                iterationId,
                fileInfo.changeTrackingId
              );
              console.log(`     ✓ ${issue.fileName}:${issue.line}`);
            } catch (err) {
              // If line comment fails, just log and continue
              console.log(`     ⚠ ${issue.fileName}:${issue.line} (skipped - line may not be in diff)`);
            }
          } else {
            console.log(`     ⚠ ${issue.fileName}:${issue.line} (file not found in changes)`);
          }
        }
      }
      
      console.log('\n  ✅ Review published!');
      console.log(`  🔗 https://dev.azure.com/${AZURE_ORG}/${encodeURIComponent(AZURE_PROJECT)}/_git/${repo.name}/pullrequest/${prId}`);
    } else {
      console.log('\n  ℹ️  Not published. Use clipboard.');
    }
    console.log('');
    
  } catch (e) {
    console.error(`  ❌ ${e.message}`);
    console.log('\n  Check: PR exists, PAT has Code>Read/Write\n');
    process.exit(1);
  }
}

main();
