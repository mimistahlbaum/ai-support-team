const VALID_MODES = new Set(['discussion', 'execution', 'consultation']);
const ALLOWED_SPEAKERS = new Set(['Scout', 'Spark', 'Forge', 'Mirror', 'Scribe', 'Admin', 'none']);

export function sanitiseCoordinatorResponse(parsed) {
  return {
    nextSpeaker: ALLOWED_SPEAKERS.has(parsed.nextSpeaker) ? parsed.nextSpeaker : 'none',
    taskComplete: Boolean(parsed.taskComplete),
    clarificationNeeded: Boolean(parsed.clarificationNeeded),
    clarificationQuestion: typeof parsed.clarificationQuestion === 'string' ? parsed.clarificationQuestion.trim() : '',
    mode: VALID_MODES.has(parsed.mode) ? parsed.mode : 'discussion',
    reason: parsed.reason || 'No reason provided.',
    nextInstruction: parsed.nextInstruction || '',
  };
}
