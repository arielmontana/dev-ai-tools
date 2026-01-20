// HTML stripping utilities

/**
 * Strip HTML tags and normalize to single-line text
 * Used for: titles, descriptions that need to be compact
 * @param {string} html - HTML string
 * @returns {string} Cleaned text
 */
export function stripHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip HTML tags preserving line structure
 * Used for: acceptance criteria, multi-line content
 * @param {string} html - HTML string
 * @returns {string} Cleaned text with newlines
 */
export function stripHtmlToLines(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '\n')
    .replace(/\n+/g, '\n')
    .trim();
}
