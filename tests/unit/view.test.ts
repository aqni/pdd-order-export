// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CollectionForm, ExportResults, OrderExportView } from "../../src/view";
import * as files from "../../src/export";
import type {
  CollectionEvent,
  ExportResult,
  ExportOptions,
} from "../../src/collect";
import type { Order } from "../../src/pdd";
import sample from "../fixtures/orders/reviewed-orders/collected.json" with { type: "json" };

// 单元测试只需样式节点；真实 CSS 转换、布局和隔离由浏览器测试覆盖。
vi.mock("../../src/styles.css?style", () => ({
  default: document.createElement("style"),
}));

// jsdom 没有模态弹层实现；真实焦点、Esc、布局由浏览器测试覆盖。
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event("close"));
};

const views: OrderExportView[] = [];

function createView(
  overrides: ConstructorParameters<typeof OrderExportView>[0] = {},
) {
  const view = new OrderExportView(overrides);
  views.push(view);
  view.element.id = "pdd-order-export";
  document.body.append(view.element);
  return view;
}

async function updated() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

afterEach(() => {
  for (const view of views.splice(0)) view.dispose();
  document.body.replaceChildren();
});

async function ui() {
  const root = document.getElementById("pdd-order-export")!.shadowRoot!;
  const native = root.querySelector("form")!;
  await updated();
  const input = (name: string) =>
    native.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const action = (name: string) =>
    [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === name,
    )!;
  return {
    root,
    native,
    input,
    action,
    running: () => root.querySelector("fieldset")!.disabled,
  };
}

test("multiple views keep independent style nodes when one element is moved", () => {
  const first = createView();
  const second = createView();
  const firstStyle = first.element.shadowRoot!.querySelector("style")!;
  const secondStyle = second.element.shadowRoot!.querySelector("style")!;
  expect(firstStyle).toBeInstanceOf(HTMLStyleElement);
  expect(secondStyle).toBeInstanceOf(HTMLStyleElement);
  expect(firstStyle).not.toBe(secondStyle);
  first.element.remove();
  document.body.append(first.element);
  expect(first.element.shadowRoot!.querySelector("style")).toBe(firstStyle);
  expect(second.element.shadowRoot!.querySelector("style")).toBe(secondStyle);
});

test("settings and results remain available without another collection", async () => {
  const collect = vi.fn(async function* (): AsyncGenerator<CollectionEvent> {
    yield {
      type: "result",
      result: { ...sample, schemaVersion: 1, reason: "end" },
    };
  });
  const download = vi.fn();
  createView({
    collect,
    download,
    source: () => ({ getOrders: vi.fn(), getOrderDetail: vi.fn() }),
  });
  const { root, native, input, running } = await ui();
  expect(running()).toBe(false);
  input("pageSize").value = "30";
  await updated();
  native.requestSubmit();
  await vi.waitFor(() =>
    expect(root.querySelector<HTMLElement>(".exports")!.hidden).toBe(false),
  );
  expect(download).not.toHaveBeenCalled();
  expect(root.querySelector("form")).toBe(native);
  expect(input("pageSize").value).toBe("30");
  expect(collect).toHaveBeenCalledOnce();
  [...root.querySelectorAll("button")]
    .find((button) => button.textContent === "导出 JSON")!
    .click();
  expect(download).toHaveBeenCalledOnce();
});

test("closing stops a pending task and keeps the partial result available after reopening", async () => {
  let aborted = false;
  createView({
    source: () => ({ getOrders: vi.fn(), getOrderDetail: vi.fn() }),
    collect: async function* (
      _source,
      _options,
      signal,
    ): AsyncGenerator<CollectionEvent> {
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        ),
      );
      yield {
        type: "result",
        result: {
          ...sample,
          schemaVersion: 1,
          reason: "cancelled",
          complete: false,
        },
      };
    },
  });
  const { root, native, action, running } = await ui();
  await updated();
  action("导出账单").click();
  native.requestSubmit();
  await vi.waitFor(() => expect(running()).toBe(true));
  action("停止并关闭").click();
  await vi.waitFor(() => expect(aborted).toBe(true));
  await vi.waitFor(() => expect(running()).toBe(false));
  action("导出账单").click();
  await vi.waitFor(() => expect(root.querySelector("dialog")!.open).toBe(true));
  const button = [...root.querySelectorAll("button")].find(
    (button) => button.textContent === "导出部分 JSON",
  )!;
  expect(button.disabled).toBe(false);
});

test("disposing a view cancels its task without updating a replacement view", async () => {
  let signal: AbortSignal | undefined;
  const view = createView({
    source: () => ({ getOrders: vi.fn(), getOrderDetail: vi.fn() }),
    collect: async function* (
      _source,
      _options,
      abort,
    ): AsyncGenerator<CollectionEvent> {
      signal = abort;
      await new Promise<void>((resolve) =>
        abort.addEventListener("abort", () => resolve(), { once: true }),
      );
      yield {
        type: "result",
        result: {
          ...sample,
          schemaVersion: 1,
          reason: "cancelled",
          complete: false,
        },
      };
    },
  });
  const { root, native } = await ui();
  native.requestSubmit();
  await vi.waitFor(() => expect(signal).toBeDefined());
  view.dispose();
  view.dispose();
  expect(signal!.aborted).toBe(true);
  expect(root.children).toHaveLength(0);
  expect(view.element.isConnected).toBe(false);
  const replacement = createView();
  const replacementRoot = replacement.element.shadowRoot!;
  await updated();
  expect(replacementRoot.querySelector("form")).not.toBe(native);
  expect(replacementRoot.querySelectorAll("dialog")).toHaveLength(1);
  expect(replacementRoot.querySelector<HTMLElement>(".exports")!.hidden).toBe(
    true,
  );
  expect(replacementRoot.querySelector("fieldset")!.disabled).toBe(false);
});

test("busy updates keep the same form and submit its draft values", async () => {
  let release!: () => void;
  const collect = vi.fn(async function* (): AsyncGenerator<CollectionEvent> {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    yield {
      type: "result",
      result: { ...sample, schemaVersion: 1, reason: "end" },
    };
  });
  createView({
    collect,
    source: () => ({ getOrders: vi.fn(), getOrderDetail: vi.fn() }),
  });
  const { root, native, input, running } = await ui();
  const action = native.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )!;
  input("pageSize").value = "30";
  native.requestSubmit();
  await vi.waitFor(() => expect(running()).toBe(true));
  expect(input("pageSize").matches(":disabled")).toBe(true);
  expect(action.type).toBe("button");
  expect(action.textContent).toBe("停止并保留结果");
  expect(collect.mock.calls[0]).toBeDefined();
  release();
  await vi.waitFor(() => expect(running()).toBe(false));
  expect(root.querySelector("form")).toBe(native);
  expect(native.querySelector('button[type="submit"]')).toBe(action);
  expect(action.textContent).toBe("重新收集");
  expect(input("pageSize").value).toBe("30");
  expect(collect).toHaveBeenCalledWith(
    expect.anything(),
    {
      startDate: "",
      endDate: "",
      pageSize: 30,
      maxPages: 100,
      includeDetails: true,
    },
    expect.any(AbortSignal),
  );
});

test("invalid input prevents collection and correction restores it", async () => {
  const collect = vi.fn(async function* (): AsyncGenerator<CollectionEvent> {
    yield {
      type: "result",
      result: { ...sample, schemaVersion: 1, reason: "end" },
    };
  });
  createView({
    collect,
    source: () => ({ getOrders: vi.fn(), getOrderDetail: vi.fn() }),
  });
  const { native, input } = await ui();
  input("pageSize").value = "0";
  const requestSettings = input("pageSize").closest("details")!;
  const settings = native.querySelector<HTMLDetailsElement>(".settings")!;
  requestSettings.open = false;
  settings.open = false;
  native.requestSubmit();
  expect(collect).not.toHaveBeenCalled();
  expect(settings.open).toBe(true);
  expect(requestSettings.open).toBe(true);
  input("pageSize").value = "10";
  input("startDate").value = "2026-10-18";
  input("endDate").value = "2026-10-17";
  native.requestSubmit();
  expect(collect).not.toHaveBeenCalled();
  input("endDate").value = "2026-10-19";
  input("endDate").dispatchEvent(new Event("input", { bubbles: true }));
  native.requestSubmit();
  await vi.waitFor(() => expect(collect).toHaveBeenCalledOnce());
});

test("result text is escaped and disposal clears the host nodes", async () => {
  const view = createView({
    source: () => ({ getOrders: vi.fn(), getOrderDetail: vi.fn() }),
    collect: async function* (): AsyncGenerator<CollectionEvent> {
      yield {
        type: "result",
        result: {
          ...sample,
          schemaVersion: 1,
          complete: false,
          reason: "failed",
          error: "<b>private</b>",
        },
      };
    },
  });
  const { root, native } = await ui();
  native.requestSubmit();
  await vi.waitFor(() =>
    expect(root.querySelector('[role="status"]')!.textContent).toContain(
      "<b>private</b>",
    ),
  );
  expect(root.querySelector("b")).toBeNull();
  view.dispose();
  await updated();
  expect(root.children).toHaveLength(0);
});

test("components expose native elements and bubbling events and preserve drafts when moved", async () => {
  const formComponent = new CollectionForm();
  const resultComponent = new ExportResults();
  const host = document.createElement("div");
  const collect = vi.fn((event: Event) => {
    expect(event.target).toBe(formComponent.element);
    formComponent.mode = "collecting";
  });
  const stop = vi.fn();
  const exportResult = vi.fn((event: Event) => {
    expect(event.target).toBe(resultComponent.element);
  });
  host.addEventListener("collect", collect);
  host.addEventListener("stop", stop);
  host.addEventListener("export", exportResult);
  expect(formComponent.element).toBeInstanceOf(HTMLFormElement);
  expect(resultComponent.element.tagName).toBe("SECTION");
  document.body.append(host);
  host.append(formComponent.element, resultComponent.element);
  const native = formComponent.element;
  const size =
    formComponent.element.querySelector<HTMLInputElement>('[name="pageSize"]')!;
  size.value = "20";
  formComponent.element.remove();
  resultComponent.element.remove();
  host.append(formComponent.element, resultComponent.element);
  expect(formComponent.element).toBe(native);
  expect(formComponent.element.querySelector('[name="pageSize"]')).toBe(size);
  expect(size.value).toBe("20");
  native.requestSubmit();
  expect(collect).toHaveBeenCalledOnce();
  expect((collect.mock.calls[0]![0] as CustomEvent).detail).toMatchObject({
    pageSize: 20,
  });
  expect(
    formComponent.element.querySelector<HTMLDetailsElement>(".settings")!.open,
  ).toBe(false);
  await updated();
  [...formComponent.element.querySelectorAll("button")]
    .find((node) => node.textContent === "停止并保留结果")!
    .click();
  expect(stop).toHaveBeenCalledOnce();
  resultComponent.data = {
    running: true,
    status: "读取详情",
    error: "",
    result: null,
    progress: {
      pages: 1,
      scanned: 2,
      selected: 2,
      current: { kind: "details", page: 1, completed: 1, total: 2 },
    },
  };
  await updated();
  const progress = resultComponent.element.querySelector("progress")!;
  expect(progress.value).toBe(1);
  expect(progress.max).toBe(2);
  resultComponent.data = {
    ...resultComponent.data,
    progress: {
      pages: 1,
      scanned: 2,
      selected: 2,
      current: { kind: "list", page: 2 },
    },
  };
  await updated();
  expect(resultComponent.element.querySelector("progress")).toBe(progress);
  expect(progress.hasAttribute("value")).toBe(false);
  resultComponent.data = {
    running: false,
    status: "可导出",
    error: "",
    progress: sample.progress,
    result: { ...sample, schemaVersion: 1, reason: "end", complete: false },
  };
  await updated();
  expect(
    resultComponent.element.querySelector('[role="status"]')!.textContent,
  ).toBe("可导出");
  [...resultComponent.element.querySelectorAll("button")]
    .find((node) => node.textContent === "导出部分 CSV")!
    .click();
  expect(exportResult).toHaveBeenCalledOnce();
  expect((exportResult.mock.calls[0]![0] as CustomEvent).detail).toBe("csv");
});

describe("task lifecycle and export coordination", () => {
  beforeEach(() => {
    vi.spyOn(files, "exportFile");
    vi.spyOn(files, "downloadFile").mockImplementation(() => {});
  });

  const options: ExportOptions = {
    startDate: "",
    endDate: "",
    pageSize: 10,
    maxPages: 10,
    includeDetails: true,
  };
  const order: Order = { order_sn: "261017-a", offset: "cursor:261017-a" };

  test("invalid retries preserve the previous result", async () => {
    const source = {
      getOrders: vi
        .fn()
        .mockResolvedValueOnce([order])
        .mockResolvedValueOnce([]),
      getOrderDetail: vi.fn(async (id: string) => ({ orderSn: id })),
    };
    const view = createView({ source: () => source });
    await expect(view.collect(options)).resolves.toBeUndefined();
    const previous = view.state;
    expect(previous).toMatchObject({
      phase: "ready",
      result: { complete: true },
    });
    await view.collect({ ...options, pageSize: 0 });
    expect(view.state).toMatchObject({
      phase: "failed",
      result: "result" in previous ? previous.result : null,
    });
    expect(source.getOrders).toHaveBeenCalledTimes(2);
  });

  test("cancel aborts the active request, rejects concurrent work and keeps a late successful detail", async () => {
    let resolve!: (detail: { orderSn: string }) => void;
    let signal!: AbortSignal;
    const source = {
      getOrders: vi.fn(async () => [order]),
      getOrderDetail: vi.fn((_id: string, active: AbortSignal) => {
        signal = active;
        return new Promise<{ orderSn: string }>((done) => {
          resolve = done;
        });
      }),
    };
    const view = createView({ source: () => source });
    const pending = view.collect(options);
    await vi.waitFor(() =>
      expect(source.getOrderDetail).toHaveBeenCalledOnce(),
    );
    await view.collect(options);
    view.cancel();
    expect(signal.aborted).toBe(true);
    expect(view.state).toMatchObject({
      phase: "cancelling",
      running: true,
    });
    resolve({ orderSn: order.order_sn });
    await pending;
    expect(view.state).toMatchObject({
      phase: "ready",
      result: {
        reason: "cancelled",
        entries: [{ detail: { orderSn: order.order_sn } }],
      },
    });
    expect(source.getOrders).toHaveBeenCalledOnce();
  });

  test("the UI can stop a new task before its first render update", async () => {
    let signal!: AbortSignal;
    const view = createView({
      source: () => ({ getOrders: vi.fn(), getOrderDetail: vi.fn() }),
      collect: async function* (
        _source,
        _options,
        active,
      ): AsyncGenerator<CollectionEvent> {
        signal = active;
        await new Promise<void>((resolve) =>
          active.addEventListener("abort", () => resolve(), { once: true }),
        );
        yield {
          type: "result",
          result: {
            ...sample,
            schemaVersion: 1,
            complete: false,
            reason: "cancelled",
          },
        };
      },
    });
    const pending = view.collect(options);
    view.element
      .shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!
      .click();
    expect(signal.aborted).toBe(true);
    expect(view.state.phase).toBe("cancelling");
    await pending;
    expect(view.state).toMatchObject({
      phase: "ready",
      result: { reason: "cancelled" },
    });
  });

  test("disposing a view aborts collection and suppresses a late page", async () => {
    let resolve!: (page: Order[]) => void;
    let signal!: AbortSignal;
    const source = {
      getOrders: vi.fn(
        (_offset: string | null, _size: number, active: AbortSignal) => {
          signal = active;
          return new Promise<Order[]>((done) => {
            resolve = done;
          });
        },
      ),
      getOrderDetail: vi.fn(),
    };
    const view = createView({ source: () => source });
    const pending = view.collect(options);
    await vi.waitFor(() => expect(source.getOrders).toHaveBeenCalledOnce());
    view.dispose();
    resolve([order]);
    await pending;
    await view.collect(options);
    expect(signal.aborted).toBe(true);
    expect(view.state).toMatchObject({
      phase: "disposed",
      running: false,
      result: null,
    });
    expect(source.getOrders).toHaveBeenCalledOnce();
    expect(source.getOrderDetail).not.toHaveBeenCalled();
  });

  function setupView() {
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
    const collect = vi.fn(async function* (): AsyncGenerator<
      CollectionEvent,
      void,
      void
    > {
      yield { type: "result", result: data };
    });
    const view = createView({
      source: () => ({ getOrders: vi.fn(), getOrderDetail: vi.fn() }),
      collect,
    });
    return { view, data, collect };
  }

  test("collection only displays the result; export is an explicit interaction", async () => {
    const { view, data } = setupView();
    const file = { name: "synthetic.csv", blob: new Blob(["synthetic"]) };
    vi.mocked(files.exportFile).mockReturnValue(file);
    await view.collect(options);
    expect(files.exportFile).not.toHaveBeenCalled();
    expect(files.downloadFile).not.toHaveBeenCalled();
    expect(view.state).toMatchObject({
      running: false,
      result: data,
      error: "",
    });
    view.export("csv");
    expect(files.exportFile).toHaveBeenCalledWith(data, "csv");
    expect(files.downloadFile).toHaveBeenCalledWith(file);
    view.dispose();
    view.export("csv");
    await view.collect(options);
    expect(files.downloadFile).toHaveBeenCalledOnce();
  });

  test("a CSV failure retains the result and JSON retry clears the error", async () => {
    const { view, data } = setupView();
    vi.mocked(files.exportFile).mockImplementationOnce(() => {
      throw new Error("private diagnostic");
    });
    await view.collect(options);
    view.export("csv");
    expect(view.state).toMatchObject({
      result: data,
      error: "CSV 生成失败，请尝试导出 JSON。",
    });
    expect(files.downloadFile).not.toHaveBeenCalled();
    const json = { name: "synthetic.json", blob: new Blob(["{}"]) };
    vi.mocked(files.exportFile).mockReturnValue(json);
    view.export("json");
    expect(view.state?.error).toBe("");
    expect(files.downloadFile).toHaveBeenCalledWith(json);
    view.dispose();
  });

  test("download failure reports a recoverable UI error without discarding collection", async () => {
    const { view, data } = setupView();
    vi.mocked(files.exportFile).mockReturnValue({
      name: "synthetic.json",
      blob: new Blob(["{}"]),
    });
    vi.mocked(files.downloadFile).mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    await view.collect(options);
    view.export("json");
    expect(view.state).toMatchObject({
      result: data,
      error: expect.stringContaining("下载权限"),
    });
    view.export("json");
    expect(view.state?.error).toBe("");
    view.dispose();
  });

  test("collection failure hides diagnostics and a fresh attempt restores the UI", async () => {
    const { view, data, collect } = setupView();
    collect.mockImplementationOnce(async function* () {
      throw new Error("private URL and token");
    });
    await view.collect(options);
    expect(view.state).toMatchObject({
      running: false,
      result: null,
      error: "操作失败，请稍后重试。",
    });
    view.export("json");
    expect(files.exportFile).not.toHaveBeenCalled();
    await view.collect(options);
    expect(view.state).toMatchObject({
      running: false,
      result: data,
      error: "",
    });
    view.dispose();
  });

  test("a replacement view starts fresh and ignores the disposed view's request", async () => {
    let resolve!: (orders: Order[]) => void;
    const source = {
      getOrders: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Order[]>((done) => {
              resolve = done;
            }),
        )
        .mockResolvedValue([]),
      getOrderDetail: vi.fn(),
    };
    const view = createView({ source: () => source });
    const previous = view.collect(options);
    await vi.waitFor(() => expect(source.getOrders).toHaveBeenCalledOnce());
    view.dispose();
    const replacement = createView({ source: () => source });
    await replacement.collect(options);
    const fresh = replacement.state;
    expect(fresh).toMatchObject({
      phase: "ready",
      result: { complete: true, entries: [] },
    });
    resolve([order]);
    await previous;
    expect(replacement.state).toBe(fresh);
    expect(view.state.phase).toBe("disposed");
    expect(source.getOrderDetail).not.toHaveBeenCalled();
  });
});
