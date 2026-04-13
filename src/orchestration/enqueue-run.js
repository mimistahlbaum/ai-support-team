import { getRunState } from '../state/in-memory-run-queue.js';
import { sendAsBot } from '../discord/send-message.js';

export function createEnqueueMeetingRun({ coordinator, executeMeetingRun }) {
  return async function enqueueMeetingRun(channel, latestUserPrompt, invocationMode) {
    const state = getRunState(channel.id);
    const payload = { latestUserPrompt, invocationMode };

    if (state.running) {
      state.queue.push(payload);
      await sendAsBot(
        coordinator,
        channel.id,
        `別の実行が進行中のためキューに追加しました。queue=${state.queue.length}`,
        'Coordinator'
      );
      return;
    }

    state.running = true;

    try {
      let current = payload;
      while (current) {
        await executeMeetingRun(channel, current.latestUserPrompt, current.invocationMode);
        current = state.queue.shift();
      }
    } finally {
      state.running = false;
    }
  };
}
