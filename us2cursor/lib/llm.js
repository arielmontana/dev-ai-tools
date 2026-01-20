// LLM utilities for Groq API

import { httpPost } from './http.js';
import { TIMEOUTS, LLM_CONFIG } from './constants.js';

/**
 * Call Groq LLM API
 * @param {string} apiKey - Groq API key
 * @param {object} options - Call options
 * @param {string} options.systemPrompt - System message (optional)
 * @param {string} options.userPrompt - User message
 * @param {number} options.maxTokens - Max tokens (default: 1000)
 * @param {number} options.temperature - Temperature (default: 0.1)
 * @param {number} options.timeoutMs - Timeout (default: 60000)
 * @returns {Promise<string>} Response content
 */
export async function callGroq(apiKey, options) {
  const {
    systemPrompt,
    userPrompt,
    maxTokens = 1000,
    temperature = 0.1,
    timeoutMs = TIMEOUTS.LLM_SHORT
  } = options;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const data = await httpPost(
    LLM_CONFIG.GROQ_ENDPOINT,
    { 'Authorization': `Bearer ${apiKey}` },
    {
      model: LLM_CONFIG.MODEL,
      messages,
      max_tokens: maxTokens,
      temperature
    },
    timeoutMs
  );

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Invalid response from Groq API');
  }

  return content;
}
