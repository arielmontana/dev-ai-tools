// Work item utilities

import { getWorkItemWithRelations } from './azure.js';
import { PARENT_WORK_ITEM_TYPES, WORK_ITEM_TYPES, AZURE_RELATIONS, TIMEOUTS } from './constants.js';

/**
 * Get work item type
 * @param {object} wi - Work item
 * @returns {string} Work item type
 */
export function getWorkItemType(wi) {
  return wi.fields?.['System.WorkItemType'] || '';
}

/**
 * Check if work item is a parent type (US/PBI/Bug)
 * @param {object} wi - Work item
 * @returns {boolean}
 */
export function isParentWorkItemType(wi) {
  return PARENT_WORK_ITEM_TYPES.includes(getWorkItemType(wi));
}

/**
 * Find parent User Story from a Task work item
 * Recursively traverses hierarchy to find US/PBI/Bug parent
 *
 * @param {object} wi - Work item with relations
 * @param {string} baseUrl - Azure DevOps base URL
 * @param {object} authHeader - Auth header
 * @param {number} timeoutMs - Request timeout
 * @returns {Promise<object|null>} Parent work item or null
 */
export async function findParentUserStory(wi, baseUrl, authHeader, timeoutMs = TIMEOUTS.DEFAULT) {
  if (!wi.relations) return null;

  const parentRel = wi.relations.find(r => r.rel === AZURE_RELATIONS.PARENT);
  if (!parentRel) return null;

  const parentId = parentRel.url?.split('/').pop();
  if (!parentId) return null;

  const parentWi = await getWorkItemWithRelations(baseUrl, authHeader, parentId, timeoutMs);
  if (!parentWi) return null;

  const parentType = getWorkItemType(parentWi);

  if (PARENT_WORK_ITEM_TYPES.includes(parentType)) {
    return parentWi;
  }

  if (parentType === WORK_ITEM_TYPES.TASK) {
    return findParentUserStory(parentWi, baseUrl, authHeader, timeoutMs);
  }

  return null;
}
