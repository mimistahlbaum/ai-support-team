import { safeJsonFromGroq } from '../../services/llm/safe-json.js';
import { taskTypeHint } from '../../domain/decision-model.js';
import { buildHistoryContext, buildUserProfileContext } from '../../orchestration/context-builders.js';

export async function askCoordinatorNextStep(task, latestUserPrompt, turnCount) {
  const parsed = await safeJsonFromGroq(
    `
あなたは Coordinator Decision Engine です。
役割は、会議の現在地点を見て次に誰が話すべきかを決めることです。

選べる nextSpeaker:
- Scout
- Spark
- Forge
- Mirror
- none

ルール:
1. 外部確認が必要そうなら Scout
2. 方向性や発想が必要なら Spark
3. 実務化や完成物が必要なら Forge
4. 重複整理、抜け確認、完了判定前の整理が必要なら Mirror
5. タスクが十分完了しているなら nextSpeaker = "none" かつ taskComplete = true
6. 不要な繰り返しは避ける
7. mode は "discussion" または "execution"
8. 次の担当への具体的指示を書く

必ず JSON だけを返してください。
形式:
{
  "nextSpeaker": "Scout",
  "taskComplete": false,
  "mode": "discussion",
  "reason": "short reason",
  "nextInstruction": "specific instruction"
}
`,
    `taskType:\n${task.taskType}\ntaskHint:\n${taskTypeHint(task.taskType)}\nuserProfile:\n${buildUserProfileContext()}\noriginalPrompt:\n${task.prompt}\nlatestUserPrompt:\n${latestUserPrompt}\nhistorySummary:\n${task.historySummary || 'No summary.'}\nrecentHistory:\n${buildHistoryContext(task.channelId, 10)}\nscoutEvidence:\n${task.scoutEvidence || '検索なし'}\nturnCount:\n${turnCount}`,
    {
      nextSpeaker: 'none',
      taskComplete: true,
      mode: 'discussion',
      reason: 'Fallback completion',
      nextInstruction: '',
    }
  );

  return {
    nextSpeaker: parsed.nextSpeaker || 'none',
    taskComplete: Boolean(parsed.taskComplete),
    mode: parsed.mode === 'execution' ? 'execution' : 'discussion',
    reason: parsed.reason || 'No reason provided.',
    nextInstruction: parsed.nextInstruction || '',
  };
}
