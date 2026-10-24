// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LitElement } from "lit";
import { ExportPanel } from "../../src/ui";
import { CollectControls } from "../../src/ui/collect";
import { ExportControls } from "../../src/ui/export";
import { PddClient, PddError, type Order } from "../../src/pdd";
import * as collection from "../../src/collect";
import * as files from "../../src/export";
import type { CollectedOrder } from "../../src/collect";
import sample from "../fixtures/orders/reviewed-orders/collected.json" with { type: "json" };

declare const jsdom: { virtualConsole: import("node:events").EventEmitter };

// jsdom 没有模态弹层实现；真实焦点、Esc、布局由浏览器测试覆盖。
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event("close"));
};

interface ViewHandle {
  readonly element: ExportPanel;
  dispose(): void;
}

const views: ViewHandle[] = [];

beforeEach(() => {
  // jsdom 26 不解析 @scope；作用域和 CSS 语法由真实浏览器测试覆盖。
  const emit = jsdom.virtualConsole.emit.bind(jsdom.virtualConsole);
  vi.spyOn(jsdom.virtualConsole, "emit").mockImplementation((name, ...args) => {
    const error = args[0] as { type?: string; detail?: unknown } | undefined;
    if (
      name === "jsdomError" &&
      error?.type === "css parsing" &&
      typeof error.detail === "string" &&
      error.detail.includes("@scope")
    )
      return false;
    return emit(name, ...args);
  });
  document.cookie = "pdd_user_id=123; path=/";
  vi.spyOn(PddClient.prototype, "getOrders").mockResolvedValue([]);
  vi.spyOn(PddClient.prototype, "getOrderDetail").mockImplementation(
    async (id) => ({ orderSn: id }),
  );
  vi.spyOn(collection, "collectOrders");
  vi.spyOn(files, "exportFile");
  vi.spyOn(files, "downloadFile").mockImplementation(() => {});
  vi.spyOn(globalThis, "alert").mockImplementation(() => {});
});

afterEach(() => {
  for (const view of views.splice(0)) view.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function createView(): Promise<ViewHandle> {
  const element = new ExportPanel();
  document.body.append(element);
  await ready(element);
  const view = {
    element,
    dispose() {
      element.dispose();
    },
  };
  views.push(view);
  return view;
}

async function updated() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function ui(view: ViewHandle) {
  const root = deepRoot(view.element.shadowRoot!);
  const native = root.querySelector<HTMLFormElement>(
    'form[aria-label="收集设置"]',
  )!;
  return {
    root,
    native,
    input: (name: string) =>
      native.querySelector<HTMLInputElement>(`input[name="${name}"]`)!,
    action: (name: string) =>
      [...root.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === name,
      )!,
    running: () => root.querySelector("fieldset")!.disabled,
    alert: () => root.querySelector<HTMLElement>('[role="alert"]')!,
    status: () => root.querySelector<HTMLElement>('[role="status"]')!,
    exports: () => root.querySelector<HTMLElement>(".exports")!,
  };
}

/** 查询公开 Shadow Roots，匹配浏览器测试的穿透查询行为。 */
function deepRoot(root: ShadowRoot) {
  function* elements(parent: ParentNode): Generator<Element> {
    for (const child of parent.children) {
      yield child;
      if (child.shadowRoot) yield* elements(child.shadowRoot);
      yield* elements(child);
    }
  }
  return {
    get children() {
      return root.children;
    },
    get textContent() {
      return [...elements(root)].map((element) => element.textContent).join("");
    },
    querySelector: ((selector: string) =>
      [...elements(root)].find((element) => element.matches(selector)) ??
      null) as ShadowRoot["querySelector"],
    querySelectorAll: <T extends Element = Element>(selector: string) =>
      [...elements(root)].filter((element) => element.matches(selector)) as T[],
  };
}

async function ready(element: Element): Promise<void> {
  if (element instanceof LitElement) await element.updateComplete;
  for (const child of element.shadowRoot?.children ?? []) await ready(child);
  for (const child of element.children) await ready(child);
}

function mockPage(entries: readonly CollectedOrder[]) {
  return {
    total: entries.length,
    orders: (async function* () {
      yield* entries;
    })(),
  };
}
function mockResult() {
  const result: readonly CollectedOrder[] = sample.entries;
  vi.mocked(collection.collectOrders).mockImplementation(async function* () {
    yield mockPage(result);
  });
  return result;
}

test("multiple views keep independent style nodes when one element is moved", async () => {
  const first = await createView();
  const second = await createView();
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

test("the collect entry works independently and hands off a result snapshot", async () => {
  const entries = mockResult();
  const component = new CollectControls();
  const started = vi.fn();
  const finished = vi.fn();
  component.addEventListener("collect-start", started);
  component.addEventListener("collect-finish", finished);
  document.body.append(component);
  await ready(component);
  const root = deepRoot(component.shadowRoot!);
  root
    .querySelector<HTMLFormElement>('form[aria-label="收集设置"]')!
    .requestSubmit();
  expect(started).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(finished).toHaveBeenCalledOnce());
  expect((finished.mock.calls[0]![0] as CustomEvent).detail).toEqual({
    entries,
    partial: false,
    startDate: null,
    endDate: null,
  });
  expect(files.exportFile).not.toHaveBeenCalled();
  expect(files.downloadFile).not.toHaveBeenCalled();
  component.dispose();
});

test("the export entry displays and downloads a supplied snapshot without collection", async () => {
  const component = new ExportControls();
  component.result = {
    entries: sample.entries,
    partial: true,
    startDate: new Date("2026-10-01"),
    endDate: new Date("2026-10-24"),
  };
  document.body.append(component);
  await ready(component);
  const root = deepRoot(component.shadowRoot!);
  expect(root.querySelector('[role="status"]')!.textContent).toContain(
    "结果不完整",
  );
  const json = root
    .querySelectorAll<HTMLButtonElement>("button")
    .find((button) => button.textContent?.includes("JSON"))!;
  json.click();
  expect(files.exportFile).toHaveBeenCalledWith(
    sample.entries,
    "json",
    new Date("2026-10-01"),
    new Date("2026-10-24"),
    true,
  );
  expect(files.downloadFile).toHaveBeenCalledOnce();
  expect(collection.collectOrders).not.toHaveBeenCalled();
  component.result = null;
  await ready(component);
  json.click();
  expect(root.querySelector("button")).toBeNull();
  expect(files.downloadFile).toHaveBeenCalledOnce();
});

test("cancelling one panel does not change another panel's task or result", async () => {
  const signals: AbortSignal[] = [];
  let finishSecond!: () => void;
  vi.mocked(collection.collectOrders).mockImplementation(
    async function* (_source, options, signal) {
      signals.push(signal);
      yield mockPage([sample.entries[options.pageSize === 10 ? 0 : 1]!]);
      if (options.pageSize === 10) {
        await new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      } else {
        await new Promise<void>((resolve) => {
          finishSecond = resolve;
        });
      }
    },
  );
  const first = ui(await createView());
  const second = ui(await createView());
  first.input("pageSize").value = "10";
  second.input("pageSize").value = "20";
  first.native.requestSubmit();
  second.native.requestSubmit();
  await vi.waitFor(() => expect(finishSecond).toBeTypeOf("function"));
  await updated();
  first.action("停止并保留结果").click();
  await vi.waitFor(() => expect(first.exports()?.hidden ?? true).toBe(false));
  expect(signals[0]!.aborted).toBe(true);
  expect(signals[1]!.aborted).toBe(false);
  expect(second.running()).toBe(true);
  expect(second.exports()).toBeNull();
  finishSecond();
  await vi.waitFor(() => expect(second.exports()?.hidden ?? true).toBe(false));
  first.action("导出部分 JSON").click();
  second.action("导出 JSON").click();
  expect(files.exportFile).toHaveBeenNthCalledWith(
    1,
    [sample.entries[0]],
    "json",
    null,
    null,
    true,
  );
  expect(files.exportFile).toHaveBeenNthCalledWith(
    2,
    [sample.entries[1]],
    "json",
    null,
    null,
    false,
  );
  expect(first.input("pageSize").value).toBe("10");
  expect(second.input("pageSize").value).toBe("20");
});

test("collection preserves settings and requires an explicit export interaction", async () => {
  const result = mockResult();
  const view = await createView();
  const { root, native, input, action, exports } = ui(view);
  input("pageSize").value = "30";
  native.requestSubmit();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(files.exportFile).not.toHaveBeenCalled();
  expect(files.downloadFile).not.toHaveBeenCalled();
  expect(root.querySelector('form[aria-label="收集设置"]')).toBe(native);
  expect(input("pageSize").value).toBe("30");
  expect(collection.collectOrders).toHaveBeenCalledOnce();
  action("导出 JSON").click();
  expect(files.exportFile).toHaveBeenCalledWith(
    result,
    "json",
    null,
    null,
    false,
  );
  expect(files.downloadFile).toHaveBeenCalledOnce();
  view.dispose();
  view.dispose();
  await updated();
  expect(root.children).toHaveLength(0);
  expect(files.downloadFile).toHaveBeenCalledOnce();
});

test("hiding keeps the task running and reopening still allows explicit cancellation", async () => {
  let signal!: AbortSignal;
  vi.mocked(PddClient.prototype.getOrders).mockResolvedValueOnce(
    sample.entries.map((e) => e.order),
  );
  vi.mocked(PddClient.prototype.getOrderDetail)
    .mockResolvedValueOnce({ orderSn: sample.entries[0]!.order.order_sn })
    .mockImplementationOnce((_id, active) => {
      signal = active;
      return new Promise((_, reject) =>
        active.addEventListener("abort", () => reject(active.reason), {
          once: true,
        }),
      );
    });
  const view = await createView();
  const { root, native, action, running, exports } = ui(view);
  root.querySelector("dialog")!.showModal();
  native.requestSubmit();
  await vi.waitFor(() => expect(running()).toBe(true));
  await vi.waitFor(() =>
    expect(PddClient.prototype.getOrderDetail).toHaveBeenCalledTimes(2),
  );
  // jsdom 不实现 method="dialog"；原生按钮和 Esc 由浏览器测试覆盖。
  root.querySelector("dialog")!.close();
  expect(root.querySelector("dialog")!.open).toBe(false);
  expect(signal.aborted).toBe(false);
  expect(running()).toBe(true);
  root.querySelector("dialog")!.showModal();
  expect(root.querySelector("dialog")!.open).toBe(true);
  action("停止并保留结果").click();
  expect(signal.aborted).toBe(true);
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(action("导出部分 JSON").disabled).toBe(false);
  expect(files.downloadFile).not.toHaveBeenCalled();
});

test("disposing aborts collection and a late page cannot update a replacement view", async () => {
  let resolve!: (page: Order[]) => void;
  let signal!: AbortSignal;
  vi.mocked(PddClient.prototype.getOrders)
    .mockImplementationOnce((_offset, _size, active) => {
      signal = active;
      return new Promise<Order[]>((done) => {
        resolve = done;
      });
    })
    .mockResolvedValue([]);
  const view = await createView();
  const previous = ui(view);
  previous.native.requestSubmit();
  await vi.waitFor(() =>
    expect(PddClient.prototype.getOrders).toHaveBeenCalledOnce(),
  );
  view.dispose();
  expect(signal.aborted).toBe(true);
  expect(previous.root.children).toHaveLength(0);
  expect(view.element.isConnected).toBe(false);
  const replacement = await createView();
  const fresh = ui(replacement);
  fresh.native.requestSubmit();
  await vi.waitFor(() =>
    expect(fresh.status().textContent).toContain("未找到订单"),
  );
  const message = fresh.status().textContent;
  resolve([{ order_sn: "261017-late", offset: "late" }]);
  await updated();
  expect(fresh.status().textContent).toBe(message);
  expect(fresh.native).not.toBe(previous.native);
  expect(fresh.root.querySelectorAll("dialog")).toHaveLength(1);
  expect(fresh.exports()?.hidden ?? true).toBe(true);
  expect(fresh.running()).toBe(false);
  expect(PddClient.prototype.getOrderDetail).not.toHaveBeenCalled();
});

test("busy updates keep native draft nodes and submit their current values", async () => {
  let release!: () => void;
  vi.mocked(collection.collectOrders).mockImplementation(async function* () {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    yield mockPage(sample.entries);
  });
  const view = await createView();
  const { root, native, input, running, exports } = ui(view);
  const action = root.querySelector<HTMLButtonElement>(".action")!;
  expect(action.form).toBe(native);
  expect(native.contains(action)).toBe(false);
  expect(root.querySelector("hr")!.hidden).toBe(true);
  input("pageSize").value = "30";
  native.requestSubmit();
  await vi.waitFor(() => expect(running()).toBe(true));
  expect(input("pageSize").matches(":disabled")).toBe(true);
  expect(action.type).toBe("button");
  expect(action.textContent?.trim()).toBe("停止并保留结果");
  expect(root.querySelector("progress")!.hasAttribute("value")).toBe(false);
  expect(root.querySelector("hr")!.hidden).toBe(false);
  expect(collection.collectOrders).toHaveBeenCalledWith(
    expect.any(PddClient),
    expect.objectContaining({ pageSize: 30 }),
    expect.any(AbortSignal),
  );
  release();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(root.querySelector('form[aria-label="收集设置"]')).toBe(native);
  expect(root.querySelector(".action")).toBe(action);
  expect(action.type).toBe("submit");
  expect(action.textContent?.trim()).toBe("重新收集");
  expect(input("pageSize").value).toBe("30");
});

test("a disconnected panel aborts its task and can collect again after reconnection", async () => {
  let resolve!: (orders: Order[]) => void;
  let signal!: AbortSignal;
  vi.mocked(PddClient.prototype.getOrders).mockImplementationOnce(
    (_cursor, _size, active) => {
      signal = active;
      return new Promise<Order[]>((done) => {
        resolve = done;
      });
    },
  );
  const view = await createView();
  ui(view).native.requestSubmit();
  await vi.waitFor(() =>
    expect(PddClient.prototype.getOrders).toHaveBeenCalledOnce(),
  );
  view.element.remove();
  await updated();
  expect(signal.aborted).toBe(true);
  document.body.append(view.element);
  await ready(view.element);
  const fresh = ui(view);
  expect(fresh.running()).toBe(false);
  fresh.native.requestSubmit();
  await vi.waitFor(() =>
    expect(fresh.status().textContent).toContain("未找到订单"),
  );
  const message = fresh.status().textContent;
  resolve([{ order_sn: "261017-late", offset: "late" }]);
  await updated();
  expect(fresh.status().textContent).toBe(message);
  expect(PddClient.prototype.getOrderDetail).not.toHaveBeenCalled();
});

test("invalid native fields prevent collection and correction restores it", async () => {
  mockResult();
  const { native, input, exports } = ui(await createView());
  input("pageSize").value = "0";
  const requestSettings = input("pageSize").closest("details")!;
  const settings = native.querySelector<HTMLDetailsElement>(".settings")!;
  requestSettings.open = false;
  settings.open = false;
  native.requestSubmit();
  expect(collection.collectOrders).not.toHaveBeenCalled();
  expect(settings.open).toBe(true);
  expect(requestSettings.open).toBe(true);
  input("pageSize").value = "10";
  input("startDate").value = "2026-10-18";
  input("endDate").value = "2026-10-17";
  native.requestSubmit();
  expect(collection.collectOrders).not.toHaveBeenCalled();
  input("endDate").value = "2026-10-19";
  input("endDate").dispatchEvent(new Event("input", { bubbles: true }));
  native.requestSubmit();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(collection.collectOrders).toHaveBeenCalledOnce();
});

test("result text is escaped and disposal clears the host nodes", async () => {
  mockResult();
  vi.mocked(collection.collectOrders).mockImplementationOnce(
    async function* () {
      throw new PddError("<b>private</b>");
    },
  );
  const view = await createView();
  const { root, native, alert, exports } = ui(view);
  native.requestSubmit();
  await vi.waitFor(() =>
    expect(alert().textContent).toContain("<b>private</b>"),
  );
  expect(root.querySelector("b")).toBeNull();
  expect(exports()?.hidden ?? true).toBe(true);
  expect(files.exportFile).not.toHaveBeenCalled();
  view.dispose();
  await updated();
  expect(root.children).toHaveLength(0);
});

test("native drafts and progress nodes survive updates and moving the view", async () => {
  let continueToList!: () => void;
  let finish!: () => void;
  vi.mocked(PddClient.prototype.getOrders)
    .mockResolvedValueOnce([
      { order_sn: "261017-a", offset: "a" },
      { order_sn: "261017-b", offset: "b" },
    ])
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve([]);
        }),
    );
  vi.mocked(PddClient.prototype.getOrderDetail)
    .mockResolvedValueOnce({ orderSn: "261017-a" })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          continueToList = () => resolve({ orderSn: "261017-b" });
        }),
    );
  const view = await createView();
  const { root, native, input, action, exports } = ui(view);
  const size = input("pageSize");
  size.value = "30";
  native.requestSubmit();
  await vi.waitFor(() => expect(root.querySelector("progress")).not.toBeNull());
  const progress = root.querySelector("progress")!;
  await vi.waitFor(() =>
    expect(root.querySelector(".counts")!.textContent).toContain("详情 1 笔"),
  );
  expect(progress.value).toBe(1);
  expect(progress.max).toBe(2);
  expect(progress.position).toBe(0.5);
  view.element.remove();
  document.body.append(view.element);
  continueToList();
  await vi.waitFor(() =>
    expect(PddClient.prototype.getOrders).toHaveBeenCalledTimes(2),
  );
  await vi.waitFor(() => expect(progress.hasAttribute("value")).toBe(false));
  expect(progress.position).toBe(-1);
  expect(root.querySelector("progress")).toBe(progress);
  expect(root.querySelector('form[aria-label="收集设置"]')).toBe(native);
  expect(input("pageSize")).toBe(size);
  expect(size.value).toBe("30");
  finish();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(input("pageSize")).toBe(size);
  expect(size.value).toBe("30");
  action("导出 CSV").click();
  expect(files.downloadFile).toHaveBeenCalledOnce();
  expect(files.downloadFile).toHaveBeenCalledWith(
    expect.stringMatching(/\.csv$/),
    expect.any(Blob),
  );
});

test.each(["cancel", "dispose"] as const)(
  "%s while a page is finishing does not request the next page",
  async (mode) => {
    let finishPage!: () => void;
    let signal!: AbortSignal;
    const nextPage = vi.fn();
    const entry = sample.entries[0]!;
    vi.mocked(collection.collectOrders).mockImplementationOnce(
      async function* (_source, _options, active) {
        signal = active;
        yield {
          total: 1,
          orders: (async function* () {
            yield entry;
            await new Promise<void>((resolve) => {
              finishPage = resolve;
            });
          })(),
        };
        nextPage();
      },
    );
    const view = await createView();
    const { native, action, exports } = ui(view);
    native.requestSubmit();
    await vi.waitFor(() => expect(finishPage).toBeTypeOf("function"));
    if (mode === "cancel") action("停止并保留结果").click();
    else view.dispose();
    expect(signal.aborted).toBe(true);
    finishPage();
    if (mode === "cancel")
      await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
    else await updated();
    expect(nextPage).not.toHaveBeenCalled();
  },
);

test("the action button can stop a newly started task immediately", async () => {
  let signal!: AbortSignal;
  vi.mocked(PddClient.prototype.getOrders).mockImplementationOnce(
    (_cursor, _size, active) => {
      signal = active;
      return new Promise((_, reject) =>
        active.addEventListener("abort", () => reject(active.reason), {
          once: true,
        }),
      );
    },
  );
  const { root, native, running, exports } = ui(await createView());
  native.requestSubmit();
  root.querySelector<HTMLButtonElement>(".action")!.click();
  expect(signal.aborted).toBe(true);
  await vi.waitFor(() => {
    expect(running()).toBe(false);
    expect(exports()?.hidden).toBe(true);
  });
});

test("cancel preserves a successful detail arriving after the abort", async () => {
  let resolve!: (detail: { orderSn: string }) => void;
  let signal!: AbortSignal;
  const order: Order = { order_sn: "261017-a", offset: "cursor:a" };
  vi.mocked(PddClient.prototype.getOrders).mockResolvedValue([order]);
  vi.mocked(PddClient.prototype.getOrderDetail).mockImplementationOnce(
    (_id, active) => {
      signal = active;
      return new Promise((done) => {
        resolve = done;
      });
    },
  );
  const { root, native, action, exports } = ui(await createView());
  native.requestSubmit();
  await vi.waitFor(() =>
    expect(PddClient.prototype.getOrderDetail).toHaveBeenCalledOnce(),
  );
  native.requestSubmit();
  action("停止并保留结果").click();
  expect(signal.aborted).toBe(true);
  resolve({ orderSn: order.order_sn });
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(root.querySelector('[aria-label="收集进度"]')).toBeNull();
  expect(root.querySelector(".counts")!.textContent?.trim()).toBe(
    "已收集 1 笔订单 · 详情 1 笔",
  );
  action("导出部分 JSON").click();
  expect(files.exportFile).toHaveBeenCalledWith(
    [{ order, detail: { orderSn: order.order_sn } }],
    "json",
    null,
    null,
    true,
  );
  expect(PddClient.prototype.getOrders).toHaveBeenCalledOnce();
});

test("a detail failure shows the error without exposing a partial export", async () => {
  const orders: Order[] = [
    { order_sn: "261017-a", offset: "a" },
    { order_sn: "261017-b", offset: "b" },
  ];
  vi.mocked(PddClient.prototype.getOrders).mockResolvedValueOnce(orders);
  vi.mocked(PddClient.prototype.getOrderDetail).mockRejectedValueOnce(
    new PddError("详情暂时不可用"),
  );
  const { native, exports, alert } = ui(await createView());
  native.requestSubmit();
  await vi.waitFor(() => expect(alert().textContent).toBe("详情暂时不可用"));
  expect(exports()?.hidden ?? true).toBe(true);
  expect(files.exportFile).not.toHaveBeenCalled();
  expect(files.downloadFile).not.toHaveBeenCalled();
});

test("a CSV failure uses a native alert and JSON retry retains the result", async () => {
  const result = mockResult();
  vi.mocked(files.exportFile).mockImplementationOnce(() => {
    throw new Error("private diagnostic");
  });
  const { root, native, action, exports } = ui(await createView());
  native.requestSubmit();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  action("导出 CSV").click();
  expect(globalThis.alert).toHaveBeenCalledExactlyOnceWith(
    "CSV 生成失败，请尝试导出 JSON。",
  );
  expect(root.textContent).not.toContain("private diagnostic");
  expect(exports()?.hidden ?? true).toBe(false);
  expect(files.downloadFile).not.toHaveBeenCalled();
  action("导出 JSON").click();
  expect(globalThis.alert).toHaveBeenCalledOnce();
  expect(files.exportFile).toHaveBeenLastCalledWith(
    result,
    "json",
    null,
    null,
    false,
  );
  expect(files.downloadFile).toHaveBeenCalledOnce();
  expect(collection.collectOrders).toHaveBeenCalledOnce();
});

test("a failed download can be retried without repeating collection", async () => {
  mockResult();
  vi.mocked(files.downloadFile).mockImplementationOnce(() => {
    throw new Error("blocked");
  });
  const { native, action, exports } = ui(await createView());
  native.requestSubmit();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  action("导出 JSON").click();
  expect(globalThis.alert).toHaveBeenCalledExactlyOnceWith(
    "无法发起下载，请检查浏览器下载权限后重试。",
  );
  expect(exports()?.hidden ?? true).toBe(false);
  action("导出 JSON").click();
  expect(globalThis.alert).toHaveBeenCalledOnce();
  expect(files.downloadFile).toHaveBeenCalledTimes(2);
  expect(collection.collectOrders).toHaveBeenCalledOnce();
});

test("collection failure hides private diagnostics and a fresh attempt restores the UI", async () => {
  mockResult();
  vi.mocked(collection.collectOrders).mockImplementationOnce(
    async function* () {
      throw new Error("private URL and token");
    },
  );
  const { root, native, exports, alert } = ui(await createView());
  native.requestSubmit();
  await vi.waitFor(() =>
    expect(alert().textContent).toBe("操作失败，请稍后重试。"),
  );
  expect(root.textContent).not.toContain("private URL and token");
  expect(exports()?.hidden ?? true).toBe(true);
  expect(files.exportFile).not.toHaveBeenCalled();
  native.requestSubmit();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(alert().hidden).toBe(true);
  expect(collection.collectOrders).toHaveBeenCalledTimes(2);
});

test("a failed session retry retains the result and fresh collection clears the collection error", async () => {
  const result = mockResult();
  const { native, action, exports, alert, status } = ui(await createView());
  native.requestSubmit();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  action("导出 JSON").click();
  expect(files.downloadFile).toHaveBeenCalledOnce();
  document.cookie = "pdd_user_id=; max-age=0; path=/";
  native.requestSubmit();
  await vi.waitFor(() => expect(alert().textContent).toContain("用户标识"));
  expect(exports()?.hidden ?? true).toBe(false);
  expect(collection.collectOrders).toHaveBeenCalledOnce();
  action("导出 JSON").click();
  expect(files.exportFile).toHaveBeenLastCalledWith(
    result,
    "json",
    null,
    null,
    false,
  );
  document.cookie = "pdd_user_id=123; path=/";
  native.requestSubmit();
  await vi.waitFor(() =>
    expect(collection.collectOrders).toHaveBeenCalledTimes(2),
  );
  await vi.waitFor(() => expect(status().textContent).toBe("收集完成。"));
  expect(exports()?.hidden ?? true).toBe(false);
  expect(alert().hidden).toBe(true);
  expect(files.downloadFile).toHaveBeenCalledTimes(2);
});
