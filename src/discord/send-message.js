import { SEND_RETRIES, SEND_TIMEOUT_MS } from '../app/constants.js';
import { splitLongText } from '../utils/text.js';
import { withTimeout } from '../utils/timeout.js';
import { retryAsync } from '../utils/retry.js';

async function getChannel(botClient, channelId) {
  let channel = botClient.channels.cache.get(channelId);
  if (!channel) channel = await botClient.channels.fetch(channelId);
  if (!channel) throw new Error(`Channel not found: ${channelId}`);
  return channel;
}

async function sendAsBot(botClient, channelId, text, label = '') {
  const channel = await retryAsync(
    () => withTimeout(() => getChannel(botClient, channelId), SEND_TIMEOUT_MS, 'fetch discord channel'),
    { retries: SEND_RETRIES, label: 'resolve discord channel' }
  );

  const chunks = splitLongText(text);
  console.log(
    `[discord-send] speaker=${label || 'unknown'} sender=${botClient.user?.tag || 'unknown'} channel=${channelId} chunks=${chunks.length}`
  );
  for (let i = 0; i < chunks.length; i++) {
    const prefix = i === 0 || !label ? '' : `[${label} cont. ${i + 1}]\n`;
    await retryAsync(
      () => withTimeout(() => channel.send(prefix + chunks[i]), SEND_TIMEOUT_MS, 'discord send'),
      { retries: SEND_RETRIES, label: 'discord send' }
    );
  }
}

async function safeCoordinatorStop(coordinator, channelId, text) {
  try {
    await sendAsBot(coordinator, channelId, text, 'Coordinator');
  } catch (error) {
    console.error('Failed to send stop message:', error.message || error);
  }
}

export { getChannel, sendAsBot, safeCoordinatorStop };
