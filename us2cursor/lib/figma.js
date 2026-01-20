// === FIGMA API ===
// Shared module for Figma API integration

/**
 * Parse a Figma URL and extract file ID and optional node ID
 * Supports formats:
 * - https://www.figma.com/file/FILEID/name
 * - https://www.figma.com/design/FILEID/name
 * - https://www.figma.com/file/FILEID/name?node-id=NODEID
 * - https://www.figma.com/design/FILEID/name?node-id=123-456
 */
export function parseFigmaUrl(url) {
  const fileMatch = url.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);
  if (!fileMatch) return null;

  const fileId = fileMatch[2];
  let nodeId = null;

  const nodeMatch = url.match(/node-id=([^&]+)/);
  if (nodeMatch) {
    // Figma node IDs use : in URL but API expects -
    nodeId = decodeURIComponent(nodeMatch[1]).replace(':', '-');
  }

  return { fileId, nodeId };
}

/**
 * Check if a string is a Figma URL
 */
export function isFigmaUrl(input) {
  return input.includes('figma.com/');
}

/**
 * Fetch content from a Figma file/node
 * @param {string} url - Figma URL
 * @param {string} figmaPat - Figma Personal Access Token
 * @returns {Promise<{success: boolean, summary?: string, error?: string, fallback?: string}>}
 */
export async function fetchFigmaContent(url, figmaPat) {
  if (!figmaPat) {
    return { success: false, error: 'No FIGMA_PAT configured', fallback: url };
  }

  const parsed = parseFigmaUrl(url);
  if (!parsed) {
    return { success: false, error: 'Invalid Figma URL', fallback: url };
  }

  try {
    const { fileId, nodeId } = parsed;
    let apiUrl = `https://api.figma.com/v1/files/${fileId}`;
    if (nodeId) {
      apiUrl += `/nodes?ids=${nodeId}`;
    }

    const res = await fetch(apiUrl, {
      headers: { 'X-Figma-Token': figmaPat }
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: `Figma API ${res.status}: ${errorText}`, fallback: url };
    }

    const data = await res.json();
    const summary = extractFigmaSummary(data, nodeId);
    return { success: true, summary };

  } catch (err) {
    return { success: false, error: err.message, fallback: url };
  }
}

/**
 * Extract a human-readable summary from Figma API response
 */
export function extractFigmaSummary(data, nodeId) {
  const elements = [];
  const componentNames = new Set();

  function traverse(node, depth = 0) {
    if (depth > 5) return; // Limit depth

    if (node.name && node.type) {
      // Capture relevant UI elements
      if (['FRAME', 'COMPONENT', 'INSTANCE', 'TEXT', 'RECTANGLE', 'GROUP'].includes(node.type)) {
        if (node.type === 'TEXT' && node.characters) {
          elements.push(`Text: "${node.characters.substring(0, 50)}"`);
        } else if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
          componentNames.add(node.name);
        } else if (node.type === 'FRAME' && depth <= 2) {
          elements.push(`Frame: ${node.name}`);
        }
      }
    }

    if (node.children) {
      node.children.forEach(child => traverse(child, depth + 1));
    }
  }

  // Handle different response structures
  if (nodeId && data.nodes) {
    const nodeData = data.nodes[nodeId.replace('-', ':')];
    if (nodeData?.document) {
      traverse(nodeData.document);
    }
  } else if (data.document) {
    traverse(data.document);
  }

  const parts = [];
  if (data.name) parts.push(`File: ${data.name}`);
  if (componentNames.size > 0) parts.push(`Components: ${[...componentNames].slice(0, 10).join(', ')}`);
  if (elements.length > 0) parts.push(`Elements: ${elements.slice(0, 15).join('; ')}`);

  return parts.join('\n') || 'Could not extract Figma content';
}
