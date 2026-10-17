import type { TaskState } from '../src/ui/model';

// Checked by tsc, never executed. Consumers must not mutate the task's raw data.
export function checkReadonlyBoundary(state: TaskState) {
  if (!state.result) {
    return;
  }
  // @ts-expect-error The result array is read-only.
  state.result.entries.push({
    order: {},
    detail: null,
    detailStatus: 'skipped',
  });
  // @ts-expect-error Task counters are read-only.
  state.result.progress.selected = 0;
  // @ts-expect-error Task options are read-only.
  state.result.options.includeDetails = false;
  const entry = state.result.entries[0]!;
  const amount = entry.order.order_amount;
  if (JSON.isRawJSON(amount)) {
    // @ts-expect-error Native raw numeric tokens are immutable.
    amount.rawJSON = '0';
  }
  // @ts-expect-error Raw order fields are read-only.
  entry.order.order_sn = 'changed';
  const nested = entry.order.nested;
  if (nested && typeof nested === 'object') {
    // @ts-expect-error Nested raw objects and arrays are read-only as well.
    nested[0] = 'changed';
  }
  if (state.progress && 'current' in state.progress) {
    // @ts-expect-error Request-local progress is read-only.
    state.progress.current.page = 0;
  }
}
