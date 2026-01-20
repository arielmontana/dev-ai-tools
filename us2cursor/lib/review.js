// Code review utilities

/**
 * Parse review output to extract issues from table format
 * Matches table rows like: | 🔴 CRITICAL | Bugs | Query.cs | 45 | issue | fix |
 * @param {string} reviewText - Review output text
 * @returns {Array<{severity: string, category: string, fileName: string, line: number, issue: string, fix: string}>}
 */
export function parseReviewIssues(reviewText) {
  const issues = [];

  // Match table rows with severity, category, file, line, issue, fix
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

/**
 * Find file info (path and change tracking ID) for a given file name
 * @param {Array<{item?: {path?: string}, changeTrackingId?: number}>} changes - PR changes
 * @param {string} fileName - File name to find
 * @returns {{path: string, changeTrackingId: number}|null}
 */
export function findFileInfo(changes, fileName) {
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

/**
 * Extract changed lines from old and new content
 * @param {string|null} oldContent - Previous file content
 * @param {string} newContent - New file content
 * @param {number} maxContext - Maximum context lines around changes (default: 3)
 * @returns {string} Formatted diff output
 */
export function extractChangedLines(oldContent, newContent, maxContext = 3) {
  if (!oldContent) {
    // New file - show first 150 lines with + prefix
    const lines = newContent.split('\n').slice(0, 150);
    return lines.map((l, i) => `+${i + 1}|${l}`).join('\n');
  }

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const changes = [];
  const changedLineNumbers = new Set();

  // Find changed lines and add context
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
    // Add separator for non-contiguous lines
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

/**
 * Extract pending comments from PR threads
 * @param {Array<{isDeleted?: boolean, status?: string|number, threadContext?: object, comments?: Array}>} threads - PR threads
 * @returns {Array<{file: string|null, line: number|null, comment: string}>}
 */
export function extractPendingComments(threads) {
  const comments = [];

  for (const thread of threads) {
    // Skip deleted threads
    if (thread.isDeleted) continue;

    // Only include threads with status "active" (1)
    if (thread.status !== 'active' && thread.status !== 1) continue;

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
