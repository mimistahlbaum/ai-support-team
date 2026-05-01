import { safeJsonFromGroq } from '../../services/llm/safe-json.js';
import { taskTypeHint } from '../../domain/decision-model.js';
import { buildHistoryContext, buildUserProfileContext } from '../../orchestration/context-builders.js';
import { sanitiseCoordinatorResponse } from './response-sanitiser.js';

export { sanitiseCoordinatorResponse } from './response-sanitiser.js';

export async function askCoordinatorNextStep(task, latestUserPrompt, turnCount, turnsRemaining, recentSpeakers = []) {
  const parsed = await safeJsonFromGroq(
    `
あなたは Coordinator Decision Engine です。
役割は、会議の現在地点を見て次に誰が話すべきかを決めることです。

選べる nextSpeaker:
- Scout
- Spark
- Forge
- Mirror
- Scribe
- Admin
- none

ルール:
1. 外部確認・検索が必要なら Scout
2. 方向性・発想・アイデア整理が必要なら Spark
3. 実務検討・完成物（文章以外）が必要なら Forge
4. 重複整理・抜け確認・完了判定前の整理が必要なら Mirror
5. ブログ・SNS・アーティストステートメント・ポートフォリオ・告知など「外に出す文章」が必要なら Scribe
6. メール返信・スケジュール・書類・請求書などの雑務完成物が必要なら Admin
7. タスクが十分完了しているなら nextSpeaker = "none" かつ taskComplete = true
8. mode は "discussion"（議論）, "execution"（実行・成果物生成）, "consultation"（ユーザーへの質問・確認）のいずれか
9. 次の担当への具体的指示を書く
10. turnsRemaining が 2 以下なら、できるだけ完了に向けて収束させること

【重要】曖昧指示への対処（turnCount === 1 のとき）:
11. originalPrompt が以下に該当する場合は clarificationNeeded = true にし、
    clarificationQuestion にユーザーへの具体的な質問を書くこと。
    該当条件:
    - 対象・内容・目的が特定できない（例: 「これをやって」「いい感じにして」）
    - 必要な固有名詞・日付・対象が一切書かれていない
    - 複数の解釈が可能で、どちらで進めるか不明
    clarificationNeeded = true の場合: nextSpeaker = "none", taskComplete = false にすること。

【重要】ループ・無駄な繰り返しの防止:
12. recentSpeakers（直近の発言者リスト）を確認し、以下に該当する場合は taskComplete = true にすること:
    - 同じエージェントが3ターン以上連続で登場している
    - 直近4ターンで目に見える進展がなく、同じ内容の繰り返しと判断できる
    - recentHistory に「検索結果なし」「関連なし」が続いている
13. Scout が「不要」と判断した後に再び Scout を呼ぶことは原則禁止

必ず JSON だけを返してください。
形式:
{
  "nextSpeaker": "Scout",
  "taskComplete": false,
  "clarificationNeeded": false,
  "clarificationQuestion": "",
  "mode": "discussion",
  "reason": "short reason",
  "nextInstruction": "specific instruction"
}
`,
    `taskType:\n${task.taskType}\ntaskHint:\n${taskTypeHint(task.taskType)}\nuserProfile:\n${buildUserProfileContext()}\noriginalPrompt:\n${task.prompt}\nlatestUserPrompt:\n${latestUserPrompt}\nhistorySummary:\n${task.historySummary || 'No summary.'}\nrecentHistory:\n${buildHistoryContext(task.channelId, 10)}\nscoutEvidence:\n${task.scoutEvidence || '検索なし'}\nturnCount:\n${turnCount}\nturnsRemaining:\n${turnsRemaining ?? '不明'}\nrecentSpeakers:\n${recentSpeakers.join(' → ') || '（なし）'}`,
    {
      nextSpeaker: 'none',
      taskComplete: true,
      clarificationNeeded: false,
      clarificationQuestion: '',
      mode: 'discussion',
      reason: 'Fallback completion',
      nextInstruction: '',
    }
  );

  return sanitiseCoordinatorResponse(parsed);
}
