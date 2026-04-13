import { searchTavily } from '../services/search/tavily-search.js';
import { notionSearch, formatNotionSearchResults } from '../services/search/notion-search.js';
import { taskTypeHint } from '../domain/decision-model.js';
import { buildHistoryContext, buildUserProfileContext } from '../orchestration/context-builders.js';
import { askScoutSearchDecision } from './scout/judge-search.js';
import { touchTask } from '../domain/task-model.js';
import { runSpark } from './spark/run-spark.js';
import { runForge } from './forge/run-forge.js';
import { runMirror } from './mirror/run-mirror.js';

export async function askAgentResponse(role, instruction, task, mode) {
  const basePrompt = `
タスク種別:\n${task.taskType}
補足:\n${taskTypeHint(task.taskType)}
ユーザープロフィール:\n${buildUserProfileContext()}
圧縮された過去要約:\n${task.historySummary || 'No summary.'}
過去ログ:\n${buildHistoryContext(task.channelId, 10)}
Scout の検索結果:\n${task.scoutEvidence || '検索なし'}
Coordinator instruction:\n${instruction}
現在モード:\n${mode}
`;

  if (role === 'Scout') {
    const decision = await askScoutSearchDecision(task.taskType, `${task.prompt}\n\nCoordinator instruction:\n${instruction}`, task.scoutEvidence || '');

    let finalText = `検索判断:\nneedSearch: ${decision.needSearch}\nneedFreshSearch: ${decision.needFreshSearch}\ncanUseExistingEvidence: ${decision.canUseExistingEvidence}\nconfidence: ${decision.confidence}\nreason: ${decision.reason}\nquery: ${decision.query || '(none)'}`;

    if (!decision.needSearch) {
      finalText += '\n\n検索は不要と判断。';
      return finalText;
    }

    if (decision.canUseExistingEvidence && task.scoutEvidence && !decision.needFreshSearch) {
      finalText += '\n\n既存の検索結果を再利用します。';
      return finalText;
    }

    const query = decision.query || instruction || task.prompt;
    const webEvidence = await searchTavily(query);
    const notionEvidence = formatNotionSearchResults(await notionSearch(query));

    const evidence = `Web results:\n${webEvidence}\n\nNotion results:\n${notionEvidence}`;
    touchTask(task, { scoutEvidence: evidence });

    finalText += `\n\n検索結果:\n${evidence}`;
    return finalText;
  }

  if (role === 'Spark') {
    return runSpark(basePrompt);
  }
  if (role === 'Forge') {
    return runForge(basePrompt, task.summary);
  }
  if (role === 'Mirror') {
    return runMirror(basePrompt);
  }
  return '(no response)';
}
