import { daysUntil } from './priority.js';

/**
 * Shared display helpers used by /brief, grant summaries, deadline radar,
 * and any other user-facing summary output.
 *
 * All functions are pure and safe when passed null/undefined inputs.
 */

export function formatDaysLabel(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) return `${Math.abs(days)}日超過`;
  if (days === 0) return '本日締切';
  return `あと${days}日`;
}

export function formatUrgencyBadge(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) return ' ⚠️超過';
  if (days === 0) return ' 🔴本日';
  if (days <= 3) return ' 🔴3日以内';
  if (days <= 7) return ' 🟠今週';
  if (days <= 14) return ' 🟡2週間以内';
  return '';
}

export function formatDeadlineLine(dueDate) {
  if (!dueDate) return '';
  const days = daysUntil(dueDate);
  const badge = formatUrgencyBadge(days);
  const label = days !== null ? `（${formatDaysLabel(days)}）` : '';
  return `📅 ${dueDate}${label}${badge}`;
}

export function truncate(text, maxLen = 100) {
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

export function bulletList(items, { prefix = '•', maxItems = 10 } = {}) {
  if (!items?.length) return '';
  const visible = items.slice(0, maxItems).map(i => `${prefix} ${i}`).join('\n');
  const extra = items.length > maxItems ? `\n…他${items.length - maxItems}件` : '';
  return visible + extra;
}

export function statusLine({ status, title, id, dueDate, channel } = {}) {
  const parts = [];
  if (status) parts.push(`[${status}]`);
  if (title) parts.push(`**${title}**`);
  if (id) parts.push(`\`${id}\``);
  const line = parts.join(' ');
  const deadline = dueDate ? `  ${formatDeadlineLine(dueDate)}` : '';
  const ch = channel ? `  <#${channel}>` : '';
  return line + deadline + ch;
}

export function sectionHeader(emoji, title, count) {
  const countStr = count != null ? ` (${count}件)` : '';
  return `${emoji} **${title}**${countStr}`;
}
