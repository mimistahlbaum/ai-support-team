import { clip } from '../utils/text.js';
import { taskMemory, getUserProfile } from '../state/runtime-state.js';

export function buildHistoryContext(channelId, maxItems = 10) {
  const task = taskMemory.get(channelId);
  if (!task || !Array.isArray(task.history) || task.history.length === 0) {
    return 'No prior history.';
  }

  return task.history
    .slice(-maxItems)
    .map((item, index) => [
      `History ${index + 1}`,
      `Role: ${item.role}`,
      `Mode: ${item.mode}`,
      `Content: ${clip(item.content, 700)}`,
    ].join('\n'))
    .join('\n\n');
}

export function buildUserProfileContext() {
  const userProfile = getUserProfile();
  if (!userProfile || Object.keys(userProfile).length === 0) return 'No user profile available.';
  return JSON.stringify(userProfile, null, 2);
}
