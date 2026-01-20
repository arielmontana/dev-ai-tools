// Configuration management

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

/**
 * Load environment configuration from .env and .env.local
 * @param {string} importMetaUrl - import.meta.url from the calling module
 */
export function loadEnvConfig(importMetaUrl) {
  const __filename = fileURLToPath(importMetaUrl);
  const __dirname = dirname(__filename);

  // Load .env first (defaults/template)
  config({ path: join(__dirname, '.env') });

  // Load .env.local second (overrides) - has priority
  const localEnvPath = join(__dirname, '.env.local');
  if (existsSync(localEnvPath)) {
    config({ path: localEnvPath, override: true });
  }
}

/**
 * Get and validate configuration
 * @param {string[]} requiredKeys - Keys that must be present
 * @param {string[]} optionalKeys - Additional optional keys to include
 * @returns {Record<string, string>} Configuration object
 */
export function getConfig(requiredKeys = [], optionalKeys = []) {
  const cfg = {};
  const missing = [];

  for (const key of requiredKeys) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    }
    cfg[key] = value || '';
  }

  for (const key of optionalKeys) {
    cfg[key] = process.env[key] || '';
  }

  if (missing.length > 0) {
    console.error('Missing config. Create .env.local with: ' + missing.join(', '));
    process.exit(1);
  }

  return cfg;
}
