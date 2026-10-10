// Tracks what the AI service is doing, so the page can show a small status light.
// "task" is the use case: 'explain' (plain-language explanation) or 'review' (second opinion on page wording).
export const USE_CASES = [
  { id: 'explain', en: 'Writing the plain-language explanation', hi: 'सरल भाषा में व्याख्या लिखना' },
  { id: 'review', en: 'Second opinion on the page wording', hi: 'पेज के शब्दों पर दूसरी राय' },
];

const fresh = () => ({ active: 0, total: 0, failed: 0, tasks: {}, lastOkAt: null, lastEndAt: 0, lastErrorAt: null, lastError: null, lastTask: null });
const state = fresh();

export function trackStart(task) {
  state.active += 1;
  state.total += 1;
  state.tasks[task] = (state.tasks[task] || 0) + 1;
  state.lastTask = task;
}

export function trackEnd(ok, error, task) {
  state.active = Math.max(0, state.active - 1);
  if (task && state.tasks[task]) {
    state.tasks[task] -= 1;
    if (state.tasks[task] <= 0) delete state.tasks[task];
  }
  state.lastEndAt = Date.now();
  if (ok) {
    state.lastOkAt = new Date().toISOString();
  } else {
    state.failed += 1;
    state.lastErrorAt = new Date().toISOString();
    state.lastError = String(error?.message || error || 'failed').slice(0, 160);
  }
}

export const activitySnapshot = () => ({ ...state, tasks: { ...state.tasks } });
export const resetActivity = () => Object.assign(state, fresh());
