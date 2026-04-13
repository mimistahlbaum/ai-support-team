const runtimeState = {
  userProfile: {},
  taskMemory: new Map(),
  saveState: {
    supabaseTimer: null,
    pendingSupabase: false,
  },
  channelRunState: new Map(),
  isShuttingDown: false,
};

export const taskMemory = runtimeState.taskMemory;
export const saveState = runtimeState.saveState;
export const channelRunState = runtimeState.channelRunState;

export function getUserProfile() {
  return runtimeState.userProfile;
}

export function setUserProfile(nextProfile) {
  runtimeState.userProfile = nextProfile;
}

export function getIsShuttingDown() {
  return runtimeState.isShuttingDown;
}

export function setIsShuttingDown(value) {
  runtimeState.isShuttingDown = Boolean(value);
}
