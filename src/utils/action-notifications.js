/**
 * Discord notification text for action executor results.
 * Centralised here so execute-run stays a thin orchestrator.
 */

const KIND_LABELS = {
  gmail_draft:    (r) => `📧 Gmail 下書き保存（件名: ${r.metadata?.subject || ''}）`,
  calendar_event: (r) => r.url ? `📅 カレンダー登録: ${r.url}` : '📅 カレンダー登録完了',
  drive:          (r) => r.url ? `📄 Drive に保存しました: ${r.url}` : '📄 Drive 保存完了',
  notion_page:    (r) => r.url ? `📝 Notion ページ作成: ${r.url}` : '📝 Notion ページ作成完了',
};

/**
 * @param {{ kind: string, url?: string|null, metadata?: object }} result
 * @returns {string}
 */
export function formatActionResultNotice(result) {
  const fn = KIND_LABELS[result.kind];
  return fn ? fn(result) : `✅ ${result.kind} 完了`;
}
