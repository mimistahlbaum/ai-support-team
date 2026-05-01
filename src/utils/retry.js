import { sleep } from './time.js';

async function retryAsync(fn, { retries = 2, delayMs = 500, label = 'operation' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt > retries) break;
      console.warn(`${label} attempt ${attempt} failed: ${error?.message || error}`);
      await sleep(delayMs * Math.pow(2, attempt - 1));
    }
  }

  throw new Error(`${label} failed after retries: ${lastError?.message || 'unknown'}`);
}

export { retryAsync };
