import fs from 'fs';
import { MANUAL_BACKUP_TASK_MEMORY_FILE, MANUAL_BACKUP_PROFILE_FILE } from '../../app/constants.js';
import { formatError } from '../../utils/errors.js';
import { taskMemory, getUserProfile } from '../../state/runtime-state.js';

function serializeTaskMemory() {
  return Object.fromEntries(taskMemory);
}

export function writeManualBackups() {
  try {
    fs.writeFileSync(
      MANUAL_BACKUP_TASK_MEMORY_FILE,
      JSON.stringify(serializeTaskMemory(), null, 2),
      'utf8'
    );
    fs.writeFileSync(
      MANUAL_BACKUP_PROFILE_FILE,
      JSON.stringify(getUserProfile(), null, 2),
      'utf8'
    );
    console.log('Manual backup files updated.');
  } catch (error) {
    console.error('Failed to write manual backup files:', formatError(error));
  }
}
