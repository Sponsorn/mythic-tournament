/**
 * API utility functions including retry logic and error handling
 */

/**
 * Sleeps for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in ms for exponential backoff (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
 * @param {Function} options.onRetry - Callback called on each retry (err, attempt)
 * @returns {Promise<any>} Result of the function
 * @throws {Error} If all retries fail
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < maxRetries) {
        // Calculate exponential backoff with jitter
        const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
        const delay = Math.floor(exponentialDelay + jitter);

        if (onRetry) {
          onRetry(err, attempt + 1, delay);
        }

        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Fetches with retry logic
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {Object} retryOptions - Retry options (see retryWithBackoff)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const timeoutMs = retryOptions.timeout || 30000;

  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(url, { ...options, signal: controller.signal });
      } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
        }
        throw err;
      }
      clearTimeout(timer);

      // Don't retry client errors (4xx), only server errors (5xx) and network errors
      if (!response.ok && response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} (will retry)`);
      }

      return response;
    },
    {
      ...retryOptions,
      onRetry: (err, attempt, delay) => {
        console.warn(`Fetch failed for ${url}, attempt ${attempt}, retrying in ${delay}ms: ${err.message}`);
        if (retryOptions.onRetry) {
          retryOptions.onRetry(err, attempt, delay);
        }
      },
    }
  );
}

/**
 * Validates a URL string
 * @param {string} urlString - URL to validate
 * @param {string[]} allowedProtocols - Allowed protocols (default: ['http:', 'https:'])
 * @returns {boolean}
 */
function isValidUrl(urlString, allowedProtocols = ['http:', 'https:']) {
  try {
    const url = new URL(urlString);
    return allowedProtocols.includes(url.protocol);
  } catch (err) {
    return false;
  }
}

/**
 * Sanitizes a string for safe storage/display
 * @param {string} input - Input string
 * @param {number} maxLength - Maximum allowed length (default: 1000)
 * @returns {string} Sanitized string
 */
function sanitizeString(input, maxLength = 1000) {
  if (!input) return '';
  const str = String(input).trim();
  return str.length > maxLength ? str.slice(0, maxLength) : str;
}

/**
 * Parses a Discord channel mention or ID
 * @param {string} input - Channel mention (<#123456>) or ID (123456)
 * @returns {string|null} Channel ID or null if invalid
 */
function parseChannelId(input) {
  const value = String(input || '').trim();
  if (!value) return null;
  const match = value.match(/^<#(\d+)>$/) || value.match(/^(\d+)$/);
  return match ? match[1] : null;
}

module.exports = {
  sleep,
  retryWithBackoff,
  fetchWithRetry,
  isValidUrl,
  sanitizeString,
  parseChannelId,
};
