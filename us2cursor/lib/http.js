// HTTP utilities with timeout support

/**
 * Fetch with configurable timeout using AbortController
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * HTTP GET with timeout and JSON parsing
 * @param {string} url - URL to fetch
 * @param {Record<string, string>} headers - Request headers
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<any>}
 */
export async function httpGet(url, headers = {}, timeoutMs = 30000) {
  const res = await fetchWithTimeout(url, { headers }, timeoutMs);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * HTTP GET returning text (for file contents)
 * @param {string} url - URL to fetch
 * @param {Record<string, string>} headers - Request headers
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<string|null>}
 */
export async function httpGetText(url, headers = {}, timeoutMs = 30000) {
  const res = await fetchWithTimeout(url, { headers }, timeoutMs);
  return res.ok ? res.text() : null;
}

/**
 * HTTP POST with timeout and JSON parsing
 * @param {string} url - URL to fetch
 * @param {Record<string, string>} headers - Request headers
 * @param {any} body - Request body (will be JSON stringified)
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<any>}
 */
export async function httpPost(url, headers = {}, body, timeoutMs = 30000) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, timeoutMs);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}
