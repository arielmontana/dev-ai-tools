// Azure DevOps API utilities

import { httpGet, httpGetText, httpPost } from './http.js';
import { stripHtmlToText, stripHtmlToLines } from './html.js';
import { TIMEOUTS } from './constants.js';

/**
 * Unwrap Azure DevOps API response
 * @param {object} data - API response
 * @param {string} key - Key to extract (default: 'value')
 * @returns {any[]} Extracted array or empty array
 */
function unwrapResponse(data, key = 'value') {
  return data?.[key] || [];
}

/**
 * Create Azure DevOps authentication header
 * @param {string} pat - Personal Access Token
 * @returns {Record<string, string>}
 */
export function createAuthHeader(pat) {
  return {
    'Authorization': `Basic ${Buffer.from(':' + pat).toString('base64')}`
  };
}

/**
 * Build Azure DevOps base URL
 * @param {string} org - Organization name
 * @param {string} project - Project name
 * @returns {string}
 */
export function buildBaseUrl(org, project) {
  return `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis`;
}

/**
 * Extract fields from work item response
 * Strips HTML tags and normalizes whitespace
 * @param {object} workItem - Work item from Azure DevOps API
 * @returns {{id: number, title: string, description: string, acceptanceCriteria: string}}
 */
export function extractFields(workItem) {
  const f = workItem.fields || {};
  return {
    id: workItem.id,
    title: f['System.Title'] || '',
    description: stripHtmlToText(f['System.Description'] || ''),
    acceptanceCriteria: stripHtmlToLines(f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '')
  };
}

/**
 * Extract user story summary (for PR review context)
 * @param {object} workItem - Work item from Azure DevOps API
 * @returns {{id: number, title: string, ac: string}}
 */
export function extractUS(workItem) {
  const f = workItem.fields || {};
  return {
    id: workItem.id,
    title: f['System.Title'] || '',
    ac: stripHtmlToLines(f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '')
  };
}

/**
 * Get a single work item by ID
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {number|string} id - Work item ID
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object>}
 */
export async function getWorkItem(baseUrl, authHeader, id, timeoutMs = TIMEOUTS.DEFAULT) {
  const url = `${baseUrl}/wit/workitems/${id}?api-version=7.0`;
  return httpGet(url, authHeader, timeoutMs);
}

/**
 * Get work item with relations (for parent lookups)
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {number|string} id - Work item ID
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object|null>}
 */
export async function getWorkItemWithRelations(baseUrl, authHeader, id, timeoutMs = TIMEOUTS.DEFAULT) {
  try {
    const url = `${baseUrl}/wit/workitems/${id}?$expand=relations&api-version=7.0`;
    return await httpGet(url, authHeader, timeoutMs);
  } catch {
    return null;
  }
}

/**
 * Get all repositories in a project
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object[]>}
 */
export async function getRepositories(baseUrl, authHeader, timeoutMs = TIMEOUTS.DEFAULT) {
  const data = await httpGet(`${baseUrl}/git/repositories?api-version=7.0`, authHeader, timeoutMs);
  return unwrapResponse(data);
}

/**
 * Get a pull request by ID
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {string} repoId - Repository ID
 * @param {number|string} prId - Pull request ID
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object>}
 */
export async function getPullRequest(baseUrl, authHeader, repoId, prId, timeoutMs = TIMEOUTS.DEFAULT) {
  const url = `${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}?api-version=7.0`;
  return httpGet(url, authHeader, timeoutMs);
}

/**
 * Get work items linked to a PR
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {string} repoId - Repository ID
 * @param {number|string} prId - Pull request ID
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object[]>}
 */
export async function getPRWorkItems(baseUrl, authHeader, repoId, prId, timeoutMs = TIMEOUTS.DEFAULT) {
  try {
    const data = await httpGet(
      `${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/workitems?api-version=7.0`,
      authHeader,
      timeoutMs
    );
    return unwrapResponse(data);
  } catch {
    return [];
  }
}

/**
 * Get PR comment threads
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {string} repoId - Repository ID
 * @param {number|string} prId - Pull request ID
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object[]>}
 */
export async function getPRComments(baseUrl, authHeader, repoId, prId, timeoutMs = TIMEOUTS.DEFAULT) {
  const data = await httpGet(
    `${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/threads?api-version=7.0`,
    authHeader,
    timeoutMs
  );
  return unwrapResponse(data);
}

/**
 * Get PR iterations
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {string} repoId - Repository ID
 * @param {number|string} prId - Pull request ID
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object[]>}
 */
export async function getPRIterations(baseUrl, authHeader, repoId, prId, timeoutMs = TIMEOUTS.DEFAULT) {
  const data = await httpGet(
    `${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/iterations?api-version=7.0`,
    authHeader,
    timeoutMs
  );
  return unwrapResponse(data);
}

/**
 * Get PR changes for an iteration
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {string} repoId - Repository ID
 * @param {number|string} prId - Pull request ID
 * @param {number} iterationId - Iteration ID
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object[]>}
 */
export async function getPRChanges(baseUrl, authHeader, repoId, prId, iterationId, timeoutMs = TIMEOUTS.DEFAULT) {
  const data = await httpGet(
    `${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/iterations/${iterationId}/changes?api-version=7.0`,
    authHeader,
    timeoutMs
  );
  return unwrapResponse(data, 'changeEntries');
}

/**
 * Get file content at a specific commit
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {string} repoId - Repository ID
 * @param {string} commitId - Commit SHA
 * @param {string} path - File path
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<string|null>}
 */
export async function getFileAtCommit(baseUrl, authHeader, repoId, commitId, path, timeoutMs = TIMEOUTS.DEFAULT) {
  const url = `${baseUrl}/git/repositories/${repoId}/items?path=${encodeURIComponent(path)}&versionType=Commit&version=${commitId}&api-version=7.0`;
  return httpGetText(url, authHeader, timeoutMs);
}

/**
 * Post a general comment to a PR
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {string} repoId - Repository ID
 * @param {number|string} prId - Pull request ID
 * @param {string} content - Comment content
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object>}
 */
export async function postGeneralComment(baseUrl, authHeader, repoId, prId, content, timeoutMs = TIMEOUTS.DEFAULT) {
  const url = `${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/threads?api-version=7.0`;
  return httpPost(url, authHeader, {
    comments: [{ parentCommentId: 0, content, commentType: 1 }],
    status: 1
  }, timeoutMs);
}

/**
 * Post a comment on a specific line in a PR
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header object
 * @param {string} repoId - Repository ID
 * @param {number|string} prId - Pull request ID
 * @param {string} filePath - File path
 * @param {number} line - Line number
 * @param {string} content - Comment content
 * @param {number} iterationId - Iteration ID
 * @param {number} changeTrackingId - Change tracking ID
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object>}
 */
export async function postLineComment(baseUrl, authHeader, repoId, prId, filePath, line, content, iterationId, changeTrackingId, timeoutMs = TIMEOUTS.DEFAULT) {
  const url = `${baseUrl}/git/repositories/${repoId}/pullrequests/${prId}/threads?api-version=7.0`;
  return httpPost(url, authHeader, {
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
  }, timeoutMs);
}
