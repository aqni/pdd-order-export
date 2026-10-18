import { PddError } from "../pdd";
import {
  InputError,
  type ExportOptions,
  type ReadonlyExportResult,
  type StopReason,
} from "../collect";
import {
  CollectionSession,
  type CollectionDependencies,
  type CollectionState,
} from "../session";
import { downloadFile, exportFile, type FileFormat } from "../export";
import type { TaskState } from "./model";

export interface SessionDependencies extends CollectionDependencies {
  download: typeof downloadFile;
}

/** Adapts collection facts and user export actions to panel feedback. */
export function createPanelSession(
  render: (state: TaskState) => void,
  overrides: Partial<SessionDependencies> = {},
) {
  const download = overrides.download ?? downloadFile;
  let active = true;
  let feedback: Partial<Pick<TaskState, "status" | "error">> = {};
  const collection = new CollectionSession((state) => {
    feedback = {};
    publish(state);
  }, overrides);

  function publish(state: CollectionState = collection.state) {
    if (!active) {
      return;
    }
    const running =
      state.phase === "collecting" || state.phase === "cancelling";
    const result = "result" in state ? state.result : null;
    render({
      running,
      result,
      progress:
        state.phase === "collecting"
          ? state.progress
          : (result?.progress ?? null),
      status: describeCollection(state),
      error: state.phase === "failed" ? describeError(state.error) : "",
      ...feedback,
    });
  }

  publish();
  return {
    collect(options: ExportOptions) {
      return collection.collect(options);
    },
    cancel() {
      collection.cancel();
    },
    export(format: FileFormat) {
      const state = collection.state;
      const result = "result" in state ? state.result : null;
      if (!active || !result?.entries.length) {
        return;
      }
      let file;
      try {
        file = exportFile(result, format);
      } catch {
        feedback = {
          error:
            format === "csv"
              ? "CSV 生成失败，请尝试导出 JSON。"
              : "JSON 生成失败，请稍后重试。",
        };
        publish();
        return;
      }
      try {
        download(file);
        const status = `已发起 ${format.toUpperCase()} 导出，请查看浏览器下载列表。`;
        feedback = {
          error: "",
          status: result.complete
            ? status
            : `结果不完整。${describeResult(result)} ${status}`,
        };
      } catch {
        feedback = { error: "无法发起下载，请检查浏览器下载权限后重试。" };
      }
      publish();
    },
    dispose() {
      active = false;
      collection.dispose();
    },
  };
}

function describeCollection(state: CollectionState): string {
  const { phase } = state;
  if (phase === "cancelling") {
    return "正在取消…";
  }
  if (phase === "collecting") {
    return "正在收集，请保持当前页面打开。";
  }
  if (phase === "failed") {
    return "未能完成收集。";
  }
  if (phase !== "ready") {
    return "设置好范围后开始收集。";
  }
  const { result } = state;
  if (result.complete && !result.entries.length) {
    return "这个日期范围内没有找到订单，可调整日期后重试。";
  }
  return (result.complete ? "" : "结果不完整。") + describeResult(result);
}

function describeError(error: unknown): string {
  return error instanceof InputError
    ? describeInputError(error)
    : error instanceof PddError
      ? error.message
      : "操作失败，请稍后重试。";
}

function describeResult(result: ReadonlyExportResult): string {
  const messages: Record<StopReason, string> = {
    end: "已读到空页，列表遍历结束。",
    range: "已读过起始日期，所选日期范围遍历结束。",
    limit: "已达到页数上限，结果不完整。",
    cancelled: "已取消，保留已获取的结果。",
    failed: "请求失败，保留已获取的结果。",
  };
  return result.error ?? messages[result.reason];
}

function describeInputError(error: InputError): string {
  const messages: Record<string, string> = {
    startDate: "请输入有效的日期。",
    endDate: "请输入有效的日期。",
    pageSize: "每页数量必须是 1–50 的整数。",
    maxPages: "页数上限必须是 1–500 的整数。",
    includeDetails: "请选择是否读取详情。",
    range: "开始日期不能晚于结束日期。",
  };
  return messages[error.field] ?? "导出设置不符合预期。";
}
