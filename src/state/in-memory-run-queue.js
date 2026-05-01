import { channelRunState } from './runtime-state.js';

export function getRunState(channelId) {
  if (!channelRunState.has(channelId)) {
    channelRunState.set(channelId, { running: false, queue: [] });
  }
  return channelRunState.get(channelId);
}

export function clearRunQueue(channelId) {
  if (channelRunState.has(channelId)) {
    channelRunState.get(channelId).queue = [];
  }
}
