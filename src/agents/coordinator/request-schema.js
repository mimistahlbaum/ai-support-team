// Request schema definition and handoff utilities for the Coordinator agent (#73)

const STATUS_TO_STAGE = {
  idle:      'new',
  running:   'in_progress',
  waiting:   'review',
  error:     'blocked',
  completed: 'done',
  archived:  'done',
};

/**
 * Map internal task status to a human-facing lifecycle stage.
 * @param {string} taskStatus
 * @returns {'new'|'in_progress'|'review'|'blocked'|'done'}
 */
export function lifecycleStage(taskStatus) {
  return STATUS_TO_STAGE[taskStatus] || 'new';
}

export function normalizeRequestSchema(task) {
  const s = task.requestSchema || {};
  return {
    goal:        s.goal        || task.prompt      || '',
    deliverable: s.deliverable || '',
    deadline:    s.deadline    || task.dueDate      || null,
    constraints: Array.isArray(s.constraints) ? s.constraints : [],
    owner:       s.owner       || '',
    source:      s.source      || '',
  };
}

// Build a structured handoff instruction from Coordinator → agent
/**
 * Build a structured handoff instruction from Coordinator to a named agent.
 * @param {string} agent - Target agent name (e.g. 'Scout', 'Forge')
 * @param {string} instruction
 * @param {object} task
 * @returns {string}
 */
export function buildHandoff(agent, instruction, task) {
  const schema = normalizeRequestSchema(task);
  const lines = [
    `【Coordinator → ${agent}】`,
    `指示: ${instruction}`,
    `目標: ${schema.goal.slice(0, 120)}`,
  ];
  if (schema.deliverable) lines.push(`成果物: ${schema.deliverable}`);
  if (schema.deadline)    lines.push(`期限: ${schema.deadline}`);
  if (schema.constraints.length) lines.push(`制約: ${schema.constraints.join(' / ')}`);
  if (schema.source)      lines.push(`参照元: ${schema.source}`);
  return lines.join('\n');
}

// Format per-task status for Discord display
export function formatTaskStatus(task) {
  const stage = lifecycleStage(task.status);
  const schema = normalizeRequestSchema(task);
  const lines = [
    `**${task.title || task.prompt?.slice(0, 50) || '（タイトルなし）'}**`,
    `ステージ: ${stage} (${task.status})`,
  ];
  if (schema.goal)        lines.push(`目標: ${schema.goal.slice(0, 80)}`);
  if (schema.deliverable) lines.push(`成果物: ${schema.deliverable}`);
  if (task.dueDate)       lines.push(`締切: ${task.dueDate}`);
  if (task.activeSpeaker && task.activeSpeaker !== 'none')
    lines.push(`担当: ${task.activeSpeaker}`);
  if (task.openQuestions?.length)
    lines.push(`未解決: ${task.openQuestions.slice(0, 2).join(' / ')}`);
  return lines.join('\n');
}
