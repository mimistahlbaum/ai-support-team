import { safeJsonFromGroq } from '../../services/llm/safe-json.js';
import { buildUserProfileContext } from '../../orchestration/context-builders.js';

export async function askScoutSearchDecision(taskType, prompt, existingEvidence = '') {
  const parsed = await safeJsonFromGroq(
    `
あなたは Scout Judge です。
役割は「この依頼に外部検索が必要かどうか」と
「今この場で新しく検索し直すべきか」を判断することです。

判断基準:
1. 最新情報、現在の状況、ニュース、締切、制度、人物や団体の公開情報確認が必要なら needSearch = true
2. 既存の検索結果で足りるなら canUseExistingEvidence = true
3. 既存結果が古い、ズレている、無関係、または不足しているなら needFreshSearch = true
4. 発想、構成、文章改善、一般的整理だけで足りるなら needSearch = false
5. query は、検索が必要な場合のみ具体的に書く
6. 推測で埋めない

必ず JSON だけを返してください。
形式:
{
  "needSearch": true,
  "needFreshSearch": false,
  "canUseExistingEvidence": true,
  "reason": "short reason",
  "query": "search query",
  "confidence": "high"
}
`,
    `taskType:\n${taskType}\nprompt:\n${prompt}\nexistingEvidence:\n${existingEvidence || 'none'}\nuserProfile:\n${buildUserProfileContext()}`,
    {
      needSearch: false,
      needFreshSearch: false,
      canUseExistingEvidence: Boolean(existingEvidence),
      reason: 'Fallback decision',
      query: '',
      confidence: 'low',
    }
  );

  return {
    needSearch: Boolean(parsed.needSearch),
    needFreshSearch: Boolean(parsed.needFreshSearch),
    canUseExistingEvidence: Boolean(parsed.canUseExistingEvidence),
    reason: parsed.reason || 'No reason provided.',
    query: parsed.query || '',
    confidence: parsed.confidence || 'low',
  };
}
