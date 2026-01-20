// PR comment publishing utilities

import { postGeneralComment, postLineComment } from './azure.js';
import { parseReviewIssues, findFileInfo } from './review.js';
import { TIMEOUTS } from './constants.js';

/**
 * Format issue as comment content
 * @param {object} issue - Parsed issue
 * @returns {string} Formatted comment
 */
function formatIssueComment(issue) {
  return `**${issue.severity}** - ${issue.category}\n\n**Issue:** ${issue.issue}\n\n**Fix:** ${issue.fix}\n\n---\n*prreview*`;
}

/**
 * Publish review to PR
 * @param {object} options - Publishing options
 * @param {string} options.baseUrl - Azure DevOps base URL
 * @param {object} options.authHeader - Auth header
 * @param {string} options.repoId - Repository ID
 * @param {number} options.prId - PR ID
 * @param {string} options.reviewContent - Full review content
 * @param {object[]} options.changes - PR changes for line comments
 * @param {number} options.iterationId - Iteration ID for line comments
 * @returns {Promise<{generalPosted: boolean, lineComments: {success: number, skipped: number}}>}
 */
export async function publishReview(options) {
  const { baseUrl, authHeader, repoId, prId, reviewContent, changes, iterationId } = options;

  // 1. Post general comment with full review
  console.log('  Posting general review...');
  await postGeneralComment(baseUrl, authHeader, repoId, prId, reviewContent, TIMEOUTS.DEFAULT);

  // 2. Parse and post individual line comments
  const issues = parseReviewIssues(reviewContent);
  const result = { generalPosted: true, lineComments: { success: 0, skipped: 0 } };

  if (issues.length > 0) {
    console.log(`  Posting ${issues.length} line comments...`);

    for (const issue of issues) {
      const fileInfo = findFileInfo(changes, issue.fileName);

      if (fileInfo) {
        const commentContent = formatIssueComment(issue);

        try {
          await postLineComment(
            baseUrl, authHeader, repoId, prId,
            fileInfo.path, issue.line, commentContent,
            iterationId, fileInfo.changeTrackingId, TIMEOUTS.DEFAULT
          );
          console.log(`     ${issue.fileName}:${issue.line}`);
          result.lineComments.success++;
        } catch {
          console.log(`     ${issue.fileName}:${issue.line} (skipped - line may not be in diff)`);
          result.lineComments.skipped++;
        }
      } else {
        console.log(`     ${issue.fileName}:${issue.line} (file not found in changes)`);
        result.lineComments.skipped++;
      }
    }
  }

  return result;
}
