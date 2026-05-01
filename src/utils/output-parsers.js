/**
 * エージェント出力テキストから構造化データを抽出するパーサー
 *
 * Gmail 下書きマーカー:
 *   【メール下書き】
 *   宛先: xxx@example.com
 *   件名: タイトル
 *   ---
 *   本文テキスト
 *
 * カレンダー登録マーカー:
 *   【カレンダー登録】
 *   件名: 打ち合わせ
 *   開始: 2026-04-20T14:00:00+09:00
 *   終了: 2026-04-20T15:00:00+09:00
 *   詳細: ...
 */

/**
 * エージェント出力内から構造化アクション配列を抽出する。
 * 期待形式: { "actions": [ { "type": "...", ... } ], "message": "...", "deliverable_id": "..." }
 *
 * 検索順:
 *  1. ```json / ``` フェンスブロック内で actions 配列を持つ最初のもの
 *  2. コードフェンスなし: ブラケットマッチングで抽出した JSON オブジェクト
 * @returns {{ actions: object[], message?: string, deliverable_id?: string } | null}
 */
export function parseStructuredActions(text) {
  // Strategy 1: code-fenced JSON blocks (```json ... ``` or ``` ... ```)
  const fenceRe = /```(?:json)?\s*([\s\S]+?)```/g;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed?.actions && Array.isArray(parsed.actions) && parsed.actions.length > 0) {
        return parsed;
      }
    } catch { /* try next block */ }
  }

  // Strategy 2: bracket-matching — handles nested objects that naive [^{}]* regex misses
  if (!text.includes('"actions"')) return null;
  const candidates = extractBracketMatchedObjects(text);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.actions && Array.isArray(parsed.actions) && parsed.actions.length > 0) {
        console.log('[output-parsers] structured actions found without code fence (bracket-matched)');
        return parsed;
      }
    } catch { /* not valid JSON, skip */ }
  }

  return null;
}

/**
 * テキスト内の { ... } オブジェクト候補をブラケット対応で抽出する。
 * @param {string} text
 * @returns {string[]}
 */
function extractBracketMatchedObjects(text) {
  const results = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '{') { i++; continue; }
    let depth = 0;
    let inString = false;
    let escape = false;
    let j = i;
    while (j < text.length) {
      const ch = text[j];
      if (escape) { escape = false; j++; continue; }
      if (ch === '\\' && inString) { escape = true; j++; continue; }
      if (ch === '"') { inString = !inString; j++; continue; }
      if (inString) { j++; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          results.push(text.slice(i, j + 1));
          i = j + 1;
          break;
        }
      }
      j++;
    }
    if (depth !== 0) break; // unclosed brace — no point continuing
  }
  return results;
}

/**
 * @returns {{ to: string, subject: string, body: string } | null}
 */
export function parseEmailDraft(text) {
  const markerIdx = text.indexOf('【メール下書き】');
  if (markerIdx === -1) return null;

  const block = text.slice(markerIdx);
  const to      = block.match(/宛先[:：]\s*(.+)/)?.[1]?.trim();
  const subject = block.match(/件名[:：]\s*(.+)/)?.[1]?.trim();
  const bodyMatch = block.match(/---+\n([\s\S]+?)(?=\n【|$)/);
  const body = bodyMatch?.[1]?.trim();

  if (!subject || !body) return null;
  return { to: to || '', subject, body };
}

/**
 * @returns {{ title: string, start: string, end: string, description: string } | null}
 */
export function parseCalendarEvent(text) {
  const markerIdx = text.indexOf('【カレンダー登録】');
  if (markerIdx === -1) return null;

  const block = text.slice(markerIdx);
  const title       = block.match(/件名[:：]\s*(.+)/)?.[1]?.trim();
  const start       = block.match(/開始[:：]\s*(.+)/)?.[1]?.trim();
  const end         = block.match(/終了[:：]\s*(.+)/)?.[1]?.trim();
  const description = block.match(/詳細[:：]\s*([\s\S]+?)(?=\n【|$)/)?.[1]?.trim() || '';

  if (!title || !start) return null;
  if (isNaN(new Date(start).getTime())) return null;

  const fallbackEnd = () => {
    const d = new Date(start);
    d.setHours(d.getHours() + 1);
    return d.toISOString();
  };
  // end が省略または無効な場合は開始から1時間後
  const endTime = (end && !isNaN(new Date(end).getTime())) ? end : fallbackEnd();

  return { title, start, end: endTime, description };
}
