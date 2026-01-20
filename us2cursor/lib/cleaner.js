// Output cleaning utilities for LLM responses

// Keywords to filter out from backend specs (UI-related)
const UI_KEYWORDS = [
  'click', 'button', 'modal', 'icon', 'display', 'show', 'figma',
  'tab', 'scroll', 'view', 'disabled', 'enabled', 'visible', 'hidden',
  'screen', 'page', 'navigate', 'hover', 'dropdown', 'popup', 'tooltip'
];

// Keywords to filter out from frontend specs (backend-related)
const BACKEND_KEYWORDS = [
  'database', 'sql', 'repository', 'entity framework', 'migration',
  'dbcontext', 'connection string', 'stored procedure'
];

/**
 * Remove LLM preamble and code blocks from output
 * @param {string} text - Raw LLM output
 * @returns {string} Cleaned text
 */
function removePreambleAndCodeBlocks(text) {
  // Remove common LLM intro phrases
  text = text.replace(/^(Here is|Here's|The following|Below is|I've extracted)[^\n]*\n*/gi, '');
  // Remove empty code blocks
  text = text.replace(/```[a-z]*\s*```/g, '');
  // Remove code block markers
  text = text.replace(/```[a-z]*\n?/gi, '');
  text = text.replace(/```/g, '');
  return text;
}

/**
 * Filter lines containing specific keywords
 * @param {string} text - Text to filter
 * @param {string[]} keywords - Keywords to filter out (case-insensitive)
 * @returns {string} Filtered text
 */
function filterKeywords(text, keywords) {
  const lines = text.split('\n');
  const filtered = lines.filter(line => {
    const lower = line.toLowerCase();
    return !keywords.some(kw => lower.includes(kw));
  });
  return filtered.join('\n').trim();
}

/**
 * Clean LLM output for backend specs
 * Removes preamble, code blocks, and UI-related keywords
 * @param {string} text - Raw LLM output
 * @returns {string} Cleaned backend spec
 */
export function cleanOutputBackend(text) {
  text = removePreambleAndCodeBlocks(text);
  return filterKeywords(text, UI_KEYWORDS);
}

/**
 * Clean LLM output for frontend specs
 * Removes preamble, code blocks, and backend-related keywords
 * @param {string} text - Raw LLM output
 * @returns {string} Cleaned frontend spec
 */
export function cleanOutputFrontend(text) {
  text = removePreambleAndCodeBlocks(text);
  return filterKeywords(text, BACKEND_KEYWORDS);
}

// Export keywords for testing
export { UI_KEYWORDS, BACKEND_KEYWORDS };
