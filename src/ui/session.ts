import { createOrderSource, readUserId } from '../api/client';
import { collectOrders } from '../core/collect';
import { errorMessage } from '../core/errors';
import { validateOptions } from '../core/dates';
import type { ExportOptions, FileFormat, OrderSource } from '../core/types';
import { downloadFile } from '../export/download';
import { exportFile } from '../export/serialize';
import type { TaskState } from './model';

export interface SessionDependencies {
  source: () => OrderSource;
  collect: typeof collectOrders;
  download: typeof downloadFile;
}

/** One isolated application session coordinates task state, rendering and downloads. */
export function createExportSession(
  render: (state: TaskState) => void,
  overrides: Partial<SessionDependencies> = {},
) {
  const dependencies = {
    source: () => createOrderSource(readUserId()),
    collect: collectOrders,
    download: downloadFile,
    ...overrides,
  };
  let active = true;
  let task: AbortController | null = null;
  let state: TaskState = {
    running: false,
    status: '设置好范围后开始导出。',
    error: '',
    progress: null,
    result: null,
  };
  const update = (change: Partial<TaskState>) => {
    if (!active) {
      return;
    }
    state = { ...state, ...change };
    render(state);
  };
  const run = async (options: ExportOptions, format: FileFormat) => {
    if (!active || task) {
      return;
    }
    update({ error: '' });
    try {
      validateOptions(options);
      const source = dependencies.source();
      const controller = new AbortController();
      task = controller;
      update({
        running: true,
        result: null,
        progress: null,
        status: '正在读取，请保持当前页面打开。',
      });
      const result = await dependencies.collect(
        source,
        options,
        controller.signal,
        (progress) => update({ progress }),
      );
      if (!active) {
        return;
      }
      update({
        result,
        progress: result.progress,
        status: `${result.complete ? '' : '结果不完整。'}${result.message}`,
      });
      if (result.complete && result.entries.length) {
        try {
          dependencies.download(exportFile(result, format));
          update({
            status: `已发起 ${format.toUpperCase()} 下载，请查看浏览器下载列表。`,
          });
        } catch {
          update({ error: '自动下载未能发起，请使用下方按钮重试。' });
        }
      } else if (result.complete) {
        update({ status: '这个日期范围内没有找到订单，可调整日期后重试。' });
      }
    } catch (error) {
      update({ error: errorMessage(error), status: '未能完成读取。' });
    } finally {
      task = null;
      update({ running: false });
    }
  };
  render(state);
  return {
    submit(options: ExportOptions, format: FileFormat) {
      void run(options, format);
    },
    cancel() {
      if (!active || !task) {
        return;
      }
      task.abort();
      update({ status: '正在取消…', progress: null });
    },
    download(format: FileFormat) {
      if (!active || task || !state.result) {
        return;
      }
      try {
        dependencies.download(exportFile(state.result, format));
        let status = `已发起 ${format.toUpperCase()} 下载，请查看浏览器下载列表。`;
        if (!state.result.complete) {
          status = `结果不完整。${state.result.message} ${status}`;
        }
        update({
          error: '',
          status,
        });
      } catch {
        update({ error: '无法发起下载，请检查浏览器下载权限后重试。' });
      }
    },
    dispose() {
      active = false;
      task?.abort();
      state = { ...state, result: null, progress: null };
    },
  };
}
