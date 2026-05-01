function daysUntil(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (isNaN(due.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - now) / (1000 * 60 * 60 * 24));
}

const TYPE_SCORE = { grant: 3, writing: 2, admin: 1, research: 1, general: 1 };
const STATUS_SCORE = { error: 3, running: 2, waiting: 1, idle: 0 };

export function calcPriority(task) {
  let score = 0;

  if (task.dueDate) {
    const days = daysUntil(task.dueDate);
    if (days !== null) {
      if (days < 0)     score += 15;
      else if (days === 0) score += 12;
      else if (days === 1) score += 10;
      else if (days <= 3)  score += 7;
      else if (days <= 7)  score += 4;
      else                 score += 1;
    }
  }

  score += TYPE_SCORE[task.taskType] || 1;
  score += STATUS_SCORE[task.status] || 0;

  return score;
}

export { daysUntil };
