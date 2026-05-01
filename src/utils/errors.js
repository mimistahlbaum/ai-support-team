function formatError(error) {
  return error?.stack || error?.message || String(error);
}

// True when the error originates from a timeout (withTimeout or Promise.race timeout)
function isTimeoutError(error) {
  return /timeout/i.test(error?.message || '');
}

// True for common transient network / upstream failures worth retrying
function isNetworkError(error) {
  const msg = error?.message || '';
  return /ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up|network/i.test(msg);
}

// True when an external API returns a non-2xx status
function isApiError(error) {
  return error?.status != null || /api error|bad gateway|service unavailable/i.test(error?.message || '');
}

export { formatError, isTimeoutError, isNetworkError, isApiError };
