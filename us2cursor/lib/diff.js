// Diff extraction utilities

import { getFileAtCommit } from './azure.js';
import { extractChangedLines } from './review.js';
import { CODE_EXTENSIONS, DIFF_LIMITS, TIMEOUTS } from './constants.js';

/**
 * Filter changes to only code files
 * @param {object[]} changes - PR changes
 * @returns {object[]} Filtered code file changes
 */
export function filterCodeFiles(changes) {
  return changes.filter(c => {
    const p = c.item?.path || '';
    return CODE_EXTENSIONS.some(e => p.endsWith(e)) && c.changeType !== 'delete';
  });
}

/**
 * Extract diff content for PR review
 * @param {object[]} codeFiles - Filtered code file changes
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header
 * @param {string} repoId - Repository ID
 * @param {string} sourceCommit - Source commit ID
 * @param {string} targetCommit - Target commit ID
 * @returns {Promise<{diffContent: string, addedLines: number}>}
 */
export async function extractDiffContent(codeFiles, baseUrl, authHeader, repoId, sourceCommit, targetCommit) {
  let diffContent = '';
  let addedLines = 0;

  for (const c of codeFiles.slice(0, DIFF_LIMITS.MAX_FILES)) {
    const path = c.item?.path;
    if (!path) continue;

    const changeType = c.changeType;
    const newContent = await getFileAtCommit(baseUrl, authHeader, repoId, sourceCommit, path, TIMEOUTS.DEFAULT);
    if (!newContent) continue;

    let fileDiff;
    if (changeType === 'add') {
      const lines = newContent.split('\n').slice(0, DIFF_LIMITS.MAX_LINES_NEW_FILE);
      fileDiff = lines.map((l, i) => `+${i + 1}|${l}`).join('\n');
      addedLines += lines.length;
    } else {
      const oldContent = await getFileAtCommit(baseUrl, authHeader, repoId, targetCommit, path, TIMEOUTS.DEFAULT);
      fileDiff = extractChangedLines(oldContent, newContent, DIFF_LIMITS.MAX_CONTEXT_LINES);
      addedLines += (fileDiff.match(/^\+/gm) || []).length;
    }

    if (fileDiff) {
      diffContent += `\n### ${path}\n\`\`\`\n${fileDiff}\n\`\`\`\n`;
    }
  }

  return { diffContent, addedLines };
}
