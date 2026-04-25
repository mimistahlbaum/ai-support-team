import { formatError } from './utils/errors.js';
import { setTaskModelHooks } from './domain/task-model.js';
import { setHistoryModelHooks } from './domain/history-model.js';
import { scheduleTaskMemorySave, archiveOldTasks } from './services/storage/task-repository.js';
import { registerCoordinatorCommands } from './discord/register-commands.js';
import { attachAllRuntimeHandlers } from './discord/runtime-handlers.js';
import {
  coordinator,
  attachReadyHandlers,
} from './discord/coordinator-client.js';
import { createExecuteMeetingRun } from './orchestration/execute-run.js';
import { createEnqueueMeetingRun } from './orchestration/enqueue-run.js';
import { createRunResume } from './orchestration/resume-run.js';
import { createAutoCreateTaskFromMessage } from './discord/auto-create-task.js';
import { attachInteractionHandler } from './discord/interaction-handler.js';
import { attachMessageHandler } from './discord/message-handler.js';
import { createAndStartHealthServer } from './app/health-server.js';
import {
  bootstrapDiscordClients,
  registerCrashHandlers,
  registerGracefulShutdown,
} from './app/bootstrap.js';
import { createHealthMonitor } from './app/health-monitor.js';
import { startProactiveScheduler, stopProactiveScheduler } from './orchestration/proactive-scheduler.js';
import { startWeeklyScout, stopWeeklyScout } from './orchestration/weekly-scout.js';
import { checkSupabaseConnection } from './services/storage/supabase-client.js';

setTaskModelHooks({ scheduleTaskMemorySave });
setHistoryModelHooks({ scheduleTaskMemorySave });

let _enqueueMeetingRun = null;
const executeMeetingRun = createExecuteMeetingRun({ coordinator, getEnqueue: () => _enqueueMeetingRun });
const enqueueMeetingRun = createEnqueueMeetingRun({ coordinator, executeMeetingRun });
_enqueueMeetingRun = enqueueMeetingRun;
const runResume = createRunResume({ coordinator, enqueueMeetingRun });
const autoCreateTaskFromMessage = createAutoCreateTaskFromMessage({ coordinator, enqueueMeetingRun });
const healthMonitor = createHealthMonitor({
  clients: { coordinator },
  checkSupabase: checkSupabaseConnection,
});

attachReadyHandlers({ registerCoordinatorCommands, formatError });
attachAllRuntimeHandlers({ coordinator }, formatError);
attachInteractionHandler({ coordinator, enqueueMeetingRun, runResume });
attachMessageHandler({ coordinator, enqueueMeetingRun, autoCreateTaskFromMessage });

const healthServer = createAndStartHealthServer({
  getHealthSnapshot: () => healthMonitor.evaluateHealth(),
});
healthMonitor.start();
registerCrashHandlers({ healthMonitor });
registerGracefulShutdown({
  clients: [coordinator],
  healthServer,
  healthMonitor,
});

await bootstrapDiscordClients({ coordinator });

// プロアクティブ通知スケジューラーを開始
startProactiveScheduler(coordinator, enqueueMeetingRun);

// 週次スカウト（助成金・奨学金・Adelaide EOI）を開始
startWeeklyScout(coordinator);

// 完了タスクのアーカイブ（起動時 + 24時間ごと）
archiveOldTasks().catch(e => console.error('[archive] startup archival failed:', e?.message));
setInterval(() => {
  archiveOldTasks().catch(e => console.error('[archive] periodic archival failed:', e?.message));
}, 24 * 60 * 60 * 1000);
