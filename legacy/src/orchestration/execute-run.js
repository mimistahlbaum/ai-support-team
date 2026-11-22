import { MAX_DYNAMIC_TURNS } from '../app/constants.js';
import { makeRunId } from '../utils/ids.js';
import { safeCoordinatorStop, sendAsBot } from '../discord/send-message.js';
import { appendHistory, addDecision, setOpenQuestions, setNextActions } from '../domain/history-model.js';
import { deriveListsFromTurn } from './derive-state.js';
import { askCoordinatorNextStep } from '../agents/coordinator/decide-next-step.js';
import { askCoordinatorFinalSummary } from '../agents/coordinator/final-summary.js';
import { askAgentResponse } from '../agents/run-agent-response.js';
import { updateHistorySummary, isProviderFailureTextFromOutput } from './update-history-summary.js';
import { getTask, touchTask } from '../domain/task-model.js';
import { scheduleTaskMemorySave } from '../services/storage/task-repository.js';

export function createExecuteMeetingRun({ coordinator }) {
  return async function executeMeetingRun(channel, latestUserPrompt, invocationMode) {
    const task = getTask(channel.id);

    if (!task) {
      await safeCoordinatorStop(coordinator, channel.id, 'このチャンネルにタスク情報がありません。新しく /starttask してください。');
      return;
    }

    const runId = makeRunId(channel.id);
    touchTask(task, {
      channelId: channel.id,
      cycleCount: 0,
      status: 'running',
      activeSpeaker: 'Coordinator',
      runId,
    });

    scheduleTaskMemorySave({ immediate: true });

    try {
      await updateHistorySummary(channel.id);

      for (let turn = 1; turn <= MAX_DYNAMIC_TURNS; turn++) {
        touchTask(task, { cycleCount: turn, activeSpeaker: 'Coordinator' });

        const next = await askCoordinatorNextStep(task, latestUserPrompt, task.cycleCount);

        addDecision(task, {
          runId,
          turn,
          invocationMode,
          nextSpeaker: next.nextSpeaker,
          mode: next.mode,
          taskComplete: next.taskComplete,
          reason: next.reason,
          nextInstruction: next.nextInstruction,
        });
        deriveListsFromTurn(task, next, latestUserPrompt);

        const coordinatorDecisionText = `会議判断:\nturn: ${task.cycleCount}\nnextSpeaker: ${next.nextSpeaker}\nmode: ${next.mode}\ntaskComplete: ${next.taskComplete}\nreason: ${next.reason}\nnextInstruction: ${next.nextInstruction || '(none)'}`;

        await sendAsBot(coordinator, channel.id, coordinatorDecisionText, 'Coordinator');
        appendHistory(channel.id, 'Coordinator', 'control', coordinatorDecisionText);

        if (next.taskComplete || next.nextSpeaker === 'none') {
          const finalSummary = await askCoordinatorFinalSummary(task, latestUserPrompt);
          await sendAsBot(coordinator, channel.id, finalSummary, 'Coordinator');
          appendHistory(channel.id, 'Coordinator', 'summary', finalSummary);

          touchTask(task, {
            summary: finalSummary,
            status: 'waiting',
            activeSpeaker: 'none',
            runId,
          });
          setOpenQuestions(task, []);
          setNextActions(task, []);

          await updateHistorySummary(channel.id);
          scheduleTaskMemorySave({ immediate: true });
          return;
        }

        const speaker = next.nextSpeaker;
        const mode = next.mode;
        const instruction = next.nextInstruction || latestUserPrompt;

        touchTask(task, { activeSpeaker: speaker });
        const output = await askAgentResponse(speaker, instruction, task, mode);

        await sendAsBot(coordinator, channel.id, output, speaker);
        appendHistory(channel.id, speaker, mode, output);

        if (isProviderFailureTextFromOutput(output)) {
          touchTask(task, { status: 'error', activeSpeaker: 'none' });
          const stopText = '外部APIの失敗が続いたため安全停止します。しばらく待ってから /continue または /resume を使ってください。';
          await safeCoordinatorStop(coordinator, channel.id, stopText);
          appendHistory(channel.id, 'Coordinator', 'control', stopText);
          scheduleTaskMemorySave({ immediate: true });
          return;
        }

        if (speaker === 'Forge' && mode === 'execution') {
          touchTask(task, { lastExecution: output });
        }
      }

      touchTask(task, { status: 'waiting', activeSpeaker: 'none' });
      const stopText = '安全上限に達したため、ここで会議を停止します。必要なら /continue または /resume で再開してください。';
      await safeCoordinatorStop(coordinator, channel.id, stopText);
      appendHistory(channel.id, 'Coordinator', 'control', stopText);
      scheduleTaskMemorySave({ immediate: true });
    } catch (error) {
      console.error('executeMeetingRun failed:', error.message || error);
      touchTask(task, { status: 'error', activeSpeaker: 'none' });
      await safeCoordinatorStop(coordinator, channel.id, `実行中にエラーが発生したため停止しました: ${error.message}`);
      appendHistory(channel.id, 'Coordinator', 'control', `Run error: ${error.message}`);
      scheduleTaskMemorySave({ immediate: true });
    }
  };
}
