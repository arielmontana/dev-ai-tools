// Shared constants for us2cursor

// === TIMEOUTS (milliseconds) ===
export const TIMEOUTS = {
  DEFAULT: 15000,      // Standard API calls
  LLM_SHORT: 60000,    // Quick LLM operations
  LLM_LONG: 90000      // Complex reviews/analysis
};

// === CODE FILE EXTENSIONS ===
export const CODE_EXTENSIONS = [
  '.cs', '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go'
];

// === WORK ITEM TYPES ===
export const WORK_ITEM_TYPES = {
  USER_STORY: 'User Story',
  PBI: 'Product Backlog Item',
  BUG: 'Bug',
  TASK: 'Task'
};

export const PARENT_WORK_ITEM_TYPES = [
  WORK_ITEM_TYPES.USER_STORY,
  WORK_ITEM_TYPES.PBI,
  WORK_ITEM_TYPES.BUG
];

// === AZURE DEVOPS RELATIONS ===
export const AZURE_RELATIONS = {
  PARENT: 'System.LinkTypes.Hierarchy-Reverse'
};

// === LLM CONFIGURATION ===
export const LLM_CONFIG = {
  MODEL: 'llama-3.3-70b-versatile',
  GROQ_ENDPOINT: 'https://api.groq.com/openai/v1/chat/completions'
};

// === DIFF LIMITS ===
export const DIFF_LIMITS = {
  MAX_FILES: 8,
  MAX_LINES_NEW_FILE: 100,
  MAX_CONTEXT_LINES: 3
};
