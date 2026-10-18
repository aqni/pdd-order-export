import { expect, test, vi } from "vitest";
import { createPanelSession } from "../../../src/ui/session";
import { exportFile, downloadFile } from "../../../src/export";
import type { TaskState } from "../../../src/ui/model";
import type {
  CollectionEvent,
  ExportOptions,
  ExportResult,
} from "../../../src/collect";
const options: ExportOptions = {
  startDate: "",
  endDate: "",
  pageSize: 10,
  maxPages: 10,
  includeDetails: true,
};

vi.mock("../../../src/export", () => ({
  exportFile: vi.fn(),
  downloadFile: vi.fn(),
}));

function panel() {
  const data: ExportResult = {
    schemaVersion: 1,
    startedAt: "2026-10-17T10:00:00.000Z",
    finishedAt: "2026-10-17T10:01:00.000Z",
    options: { ...options },
    reason: "end",
    complete: true,
    error: null,
    progress: {
      pages: 2,
      scanned: 1,
      selected: 1,
    },
    entries: [
      {
        order: { order_sn: "261017-a", offset: "cursor:261017-a" },
        detail: null,
      },
    ],
  };
  const states: TaskState[] = [];
  const collect = vi.fn(async function* (): AsyncGenerator<
    CollectionEvent,
    void,
    void
  > {
    yield { type: "result", result: data };
  });
  const session = createPanelSession((state) => states.push(state), {
    source: () => ({ getOrders: vi.fn(), getOrderDetail: vi.fn() }),
    collect,
  });
  return { session, states, data, collect };
}

test("collection only displays the result; export is an explicit interaction", async () => {
  const { session, states, data } = panel();
  const file = { name: "synthetic.csv", blob: new Blob(["synthetic"]) };
  vi.mocked(exportFile).mockReturnValue(file);
  await session.collect(options);
  expect(exportFile).not.toHaveBeenCalled();
  expect(downloadFile).not.toHaveBeenCalled();
  expect(states.at(-1)).toMatchObject({
    running: false,
    result: data,
    error: "",
  });
  session.export("csv");
  expect(exportFile).toHaveBeenCalledWith(data, "csv");
  expect(downloadFile).toHaveBeenCalledWith(file);
  session.dispose();
});

test("a CSV failure retains the result and JSON retry clears the error", async () => {
  const { session, states, data } = panel();
  vi.mocked(exportFile).mockImplementationOnce(() => {
    throw new Error("private diagnostic");
  });
  await session.collect(options);
  session.export("csv");
  expect(states.at(-1)).toMatchObject({
    result: data,
    error: "CSV 生成失败，请尝试导出 JSON。",
  });
  expect(downloadFile).not.toHaveBeenCalled();
  const json = { name: "synthetic.json", blob: new Blob(["{}"]) };
  vi.mocked(exportFile).mockReturnValue(json);
  session.export("json");
  expect(states.at(-1)?.error).toBe("");
  expect(downloadFile).toHaveBeenCalledWith(json);
  session.dispose();
});

test("download failure reports a recoverable UI error without discarding collection", async () => {
  const { session, states, data } = panel();
  vi.mocked(exportFile).mockReturnValue({
    name: "synthetic.json",
    blob: new Blob(["{}"]),
  });
  vi.mocked(downloadFile).mockImplementationOnce(() => {
    throw new Error("blocked");
  });
  await session.collect(options);
  session.export("json");
  expect(states.at(-1)).toMatchObject({
    result: data,
    error: expect.stringContaining("下载权限"),
  });
  session.export("json");
  expect(states.at(-1)?.error).toBe("");
  session.dispose();
});

test("collection failure hides diagnostics and a fresh attempt restores the UI", async () => {
  const { session, states, data, collect } = panel();
  collect.mockImplementationOnce(async function* () {
    throw new Error("private URL and token");
  });
  await session.collect(options);
  expect(states.at(-1)).toMatchObject({
    running: false,
    result: null,
    error: "操作失败，请稍后重试。",
  });
  session.export("json");
  expect(exportFile).not.toHaveBeenCalled();
  await session.collect(options);
  expect(states.at(-1)).toMatchObject({
    running: false,
    result: data,
    error: "",
  });
  session.dispose();
});
