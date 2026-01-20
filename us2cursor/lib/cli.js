// CLI utilities

import * as readline from 'readline';

/**
 * Ask user a question and return trimmed answer
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's answer (lowercase, trimmed)
 */
export function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Ask yes/no question
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>} True if yes
 */
export async function askYesNo(question) {
  const answer = await askQuestion(question);
  return answer === 'y' || answer === 'yes';
}

/**
 * Print formatted header box
 * @param {string} title - Header title
 */
export function printHeader(title) {
  console.log('\n' + '+'.padEnd(56, '=') + '+');
  console.log('|   ' + title.padEnd(52) + '|');
  console.log('+'.padEnd(56, '=') + '+\n');
}

/**
 * Print divider line
 * @param {number} width - Line width (default: 55)
 */
export function printDivider(width = 55) {
  console.log('-'.repeat(width));
}

/**
 * Validate numeric ID argument
 * @param {string} value - Value to validate
 * @param {string} name - Name for error message
 * @returns {number} Parsed number
 */
export function validateNumericId(value, name = 'ID') {
  const id = parseInt(value, 10);
  if (isNaN(id) || id <= 0) {
    console.error(`  Error: Invalid ${name}. Must be a positive number.`);
    process.exit(1);
  }
  return id;
}
