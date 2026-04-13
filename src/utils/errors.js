function formatError(error) {
  return error?.stack || error?.message || String(error);
}

export { formatError };
