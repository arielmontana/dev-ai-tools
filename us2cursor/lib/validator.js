// Output validation for generated specs

/**
 * Validate backend spec output structure
 * Checks for required sections: Mutation, Input, Returns, Behavior, Rules, AC
 * @param {string} text - Generated spec text
 * @returns {{isValid: boolean, issues: string[]}}
 */
export function validateBackendOutput(text) {
  const issues = [];

  if (!text.includes('Mutation:')) issues.push('Missing "Mutation:" section');
  if (!text.includes('- Name:')) issues.push('Missing "- Name:" in Mutation');
  if (!text.includes('- Input:')) issues.push('Missing "- Input:" in Mutation');
  if (!text.includes('- Returns:')) issues.push('Missing "- Returns:" in Mutation');
  if (!text.includes('Behavior:')) issues.push('Missing "Behavior:" section');
  if (!text.includes('Rules:')) issues.push('Missing "Rules:" section');
  if (!text.includes('AC:')) issues.push('Missing "AC:" section');

  // Check for truncation indicators
  if (text.endsWith('-') || text.endsWith(':') || text.endsWith(',')) {
    issues.push('Output appears to be truncated');
  }

  // Check for incomplete C# record syntax
  const recordMatches = text.match(/record \w+\([^)]*$/gm);
  if (recordMatches) issues.push('Incomplete record (missing closing parenthesis)');

  return { isValid: issues.length === 0, issues };
}

/**
 * Validate frontend spec output structure
 * Checks for required sections: Component, Name, UI Elements, Behavior/Interactions, AC
 * @param {string} text - Generated spec text
 * @returns {{isValid: boolean, issues: string[]}}
 */
export function validateFrontendOutput(text) {
  const issues = [];

  if (!text.includes('Component:')) issues.push('Missing "Component:" section');
  if (!text.includes('- Name:')) issues.push('Missing "- Name:" in Component');
  if (!text.includes('UI Elements:') && !text.includes('Elements:')) issues.push('Missing "UI Elements:" section');
  if (!text.includes('Behavior:') && !text.includes('Interactions:')) issues.push('Missing "Behavior:" or "Interactions:" section');
  if (!text.includes('AC:')) issues.push('Missing "AC:" section');

  // Check for truncation indicators
  if (text.endsWith('-') || text.endsWith(':') || text.endsWith(',')) {
    issues.push('Output appears to be truncated');
  }

  return { isValid: issues.length === 0, issues };
}

// Alias for backward compatibility
export const validateOutput = validateBackendOutput;
