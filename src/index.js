import { formatError } from './utils/errors.js';
import { setTaskModelHooks } from './domain/task-model.js';
import { setHistoryModelHooks } from './domain/history-model.js';
import { scheduleTaskMemorySave } from './services/storage/task-repository.js';
import { registerCoordinatorCommands } from './discord/register-commands.js';
import { attachAllRuntimeHandlers } from './discord/runtime-handlers.js';
import {
  scout,
  spark,
  forge,
  mirror,
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

setTaskModelHooks({ scheduleTaskMemorySave });
setHistoryModelHooks({ scheduleTaskMemorySave });

const executeMeetingRun = createExecuteMeetingRun({ coordinator });
const enqueueMeetingRun = createEnqueueMeetingRun({ coordinator, executeMeetingRun });
const runResume = createRunResume({ coordinator, enqueueMeetingRun });
const autoCreateTaskFromMessage = createAutoCreateTaskFromMessage({ coordinator, enqueueMeetingRun });
const healthMonitor = createHealthMonitor({
  clients: { scout, spark, forge, mirror, coordinator },
});

attachReadyHandlers({ registerCoordinatorCommands, formatError });
attachAllRuntimeHandlers({ scout, spark, forge, mirror, coordinator }, formatError);
attachInteractionHandler({ coordinator, enqueueMeetingRun, runResume });
attachMessageHandler({ coordinator, enqueueMeetingRun, autoCreateTaskFromMessage });

const healthServer = createAndStartHealthServer({
  getHealthSnapshot: () => healthMonitor.evaluateHealth(),
});
healthMonitor.start();
registerCrashHandlers({ healthMonitor });
registerGracefulShutdown({
  clients: [scout, spark, forge, mirror, coordinator],
  healthServer,
  healthMonitor,
});

await bootstrapDiscordClients({ scout, spark, forge, mirror, coordinator });
