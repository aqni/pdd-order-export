// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h, render } from "preact";
import { ExportPanel } from "../../src/ui";
import stylesheet from "../../src/ui/styles.css?style";
import { PddClient, PddError, type Order } from "../../src/pdd";
import * as collection from "../../src/collect";
import * as files from "../../src/export";
import type { CollectedOrder } from "../../src/collect";
import sample from "../fixtures/orders/reviewed-orders/collected.json" with { type: "json" };

// 单元测试只需样式节点；真实 CSS 转换、布局和隔离由浏览器测试覆盖。
vi.mock("../../src/ui/styles.css?style", () => ({
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

interface ViewHandle {
  readonly element: HTMLDivElement;
  dispose(): void;
}

const views: ViewHandle[] = [];

beforeEach(() => {
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

function createView(): ViewHandle {
  const element = document.createElement("div");
  const mount = document.createElement("div");
  const root = element.attachShadow({ mode: "open" });
  root.append(stylesheet.cloneNode(true), mount);
  render(h(ExportPanel, {}), mount);
  document.body.append(element);
  const view: ViewHandle = {
    element,
    dispose() {
      render(null, mount);
      root.replaceChildren();
      element.remove();
    },
  };
  views.push(view);
  return view;
}

async function updated() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function ui(view: ViewHandle) {
  const root = view.element.shadowRoot!;
  const native = root.querySelector<HTMLFormElement>("form[aria-label]")!;
  return {
    root,
    native,
    input: (name: string) =>
      native.querySelector<HTMLInputElement>(`input[name="${name}"]`)!,
    action: (name: string) =>
      [...root.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === name,
      )!,
    running: () => root.querySelector("fieldset")!.disabled,
    alert: () => root.querySelector<HTMLElement>('[role="alert"]')!,
    status: () => root.querySelector<HTMLElement>('[role="status"]')!,
    exports: () => root.querySelector<HTMLElement>(".exports")!,
  };
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

test("collection preserves settings and requires an explicit export interaction", async () => {
  const result = mockResult();
  const view = createView();
  const { root, native, input, action, exports } = ui(view);
  input("pageSize").value = "30";
  native.requestSubmit();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(files.exportFile).not.toHaveBeenCalled();
  expect(files.downloadFile).not.toHaveBeenCalled();
  expect(root.querySelector<HTMLFormElement>("form[aria-label]")).toBe(native);
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

test("hiding preserves a pending task until an explicit stop", async () => {
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
  const view = createView();
  const { root, native, action, running, exports } = ui(view);
  root.querySelector("dialog")!.showModal();
  native.requestSubmit();
  await vi.waitFor(() => expect(running()).toBe(true));
  await vi.waitFor(() =>
    expect(PddClient.prototype.getOrderDetail).toHaveBeenCalledTimes(2),
  );
  root.querySelector("dialog")!.close();
  expect(signal.aborted).toBe(false);
  root.querySelector("dialog")!.showModal();
  action("停止并保留结果").click();
  expect(signal.aborted).toBe(true);
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(root.querySelector("dialog")!.open).toBe(true);
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
  const view = createView();
  const previous = ui(view);
  previous.native.requestSubmit();
  await vi.waitFor(() =>
    expect(PddClient.prototype.getOrders).toHaveBeenCalledOnce(),
  );
  view.dispose();
  expect(signal.aborted).toBe(true);
  expect(previous.root.children).toHaveLength(0);
  expect(view.element.isConnected).toBe(false);
  const replacement = createView();
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
  const view = createView();
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
  expect(action.textContent).toBe("停止并保留结果");
  expect(root.querySelector("progress")!.hasAttribute("value")).toBe(false);
  expect(root.querySelector("hr")!.hidden).toBe(false);
  expect(collection.collectOrders).toHaveBeenCalledWith(
    expect.any(PddClient),
    expect.objectContaining({ pageSize: 30 }),
    expect.any(AbortSignal),
  );
  release();
  await vi.waitFor(() => expect(exports()?.hidden ?? true).toBe(false));
  expect(root.querySelector<HTMLFormElement>("form[aria-label]")).toBe(native);
  expect(root.querySelector(".action")).toBe(action);
  expect(action.type).toBe("submit");
  expect(action.textContent).toBe("重新收集");
  expect(input("pageSize").value).toBe("30");
});

test("invalid native fields prevent collection and correction restores it", async () => {
  mockResult();
  const { native, input, exports } = ui(createView());
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
  const view = createView();
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
  const view = createView();
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
  expect(root.querySelector<HTMLFormElement>("form[aria-label]")).toBe(native);
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
    const view = createView();
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
  const { root, native, running, exports } = ui(createView());
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
  const { root, native, action, exports } = ui(createView());
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
  expect(
    root.querySelector('[aria-label="收集结果"] .counts')!.textContent,
  ).toBe("已收集 1 笔订单 · 详情 1 笔");
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
  const { native, exports, alert } = ui(createView());
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
  const { root, native, action, exports } = ui(createView());
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
  const { native, action, exports } = ui(createView());
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
  const { root, native, exports, alert } = ui(createView());
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
  const { native, action, exports, alert, status } = ui(createView());
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
