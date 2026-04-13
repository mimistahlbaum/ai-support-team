function makeRunId(channelId) {
  return `${channelId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export { makeRunId };
