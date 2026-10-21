import van from "vanjs-core";
import { PddClient, PddError } from "./pdd";
import {
  collectOrders,
  validateOptions,
  InputError,
  type ExportOptions,
  type LiveProgress,
  type ReadonlyExportResult,
  type StopReason,
  type Progress,
} from "./collect";
import { downloadFile, exportFile, type FileFormat } from "./export";
import stylesheet from "./styles.css?style";

const {
  button,
  details,
  dialog,
  div,
  fieldset,
  form,
  h2,
  h3,
  header,
  input,
  label,
  li,
  p,
  progress,
  section,
  small,
  span,
  summary,
  ul,
} = van.tags;

/** 根视图的任务状态；表单草稿保留在原生控件中。 */
interface ViewState extends ExportResultsData {
  readonly phase:
    "idle" | "collecting" | "cancelling" | "ready" | "failed" | "disposed";
}

const initialState: ViewState = {
  phase: "idle",
  running: false,
  status: "",
  error: "",
  progress: null,
  result: null,
};

interface ViewServices {
  source: () => Pick<PddClient, "getOrders" | "getOrderDetail">;
  collect: typeof collectOrders;
  download: typeof downloadFile;
}

/** 根视图拥有任务、响应式状态和弹层生命周期。 */
export class OrderExportView {
  readonly element = div();
  readonly #state = van.state<ViewState>(initialState);
  readonly #services: ViewServices;
  readonly #collection = new CollectionForm();
  readonly #results = new ExportResults();
  #controller: AbortController | null = null;
  readonly #modal: HTMLDialogElement;
  readonly #launcher: HTMLButtonElement;

  constructor(services: Partial<ViewServices> = {}) {
    this.#services = {
      source: () => new PddClient(),
      collect: collectOrders,
      download: downloadFile,
      ...services,
    };
    this.#modal = dialog(
      {
        "aria-labelledby": "panel-title",
        oncollect: (event: CustomEvent<ExportOptions>) => {
          void this.collect(event.detail);
        },
        onstop: this.cancel,
        onexport: (event: CustomEvent<FileFormat>) => this.export(event.detail),
      },
      header(
        h2({ id: "panel-title" }, "订单导出"),
        button({ type: "button", onclick: this.#close }, () =>
          this.#state.val.running ? "停止并关闭" : "关闭",
        ),
      ),
      this.#collection.element,
      this.#results.element,
    );
    this.#modal.onclose = this.#onClose;
    this.#modal.oncancel = this.cancel;
    this.#launcher = button(
      { class: "launcher", type: "button", onclick: this.#open },
      "导出账单",
    );
    this.element
      .attachShadow({ mode: "open" })
      .append(stylesheet.cloneNode(true), this.#launcher, this.#modal);
  }

  get state(): ViewState {
    return this.#state.rawVal;
  }

  /** 移除视图前显式销毁；销毁后的实例不再接收任务。 */
  dispose(): void {
    if (this.#state.rawVal.phase === "disposed") return;
    this.#controller?.abort();
    this.#controller = null;
    this.#update("disposed", initialState);
    this.#modal.onclose = null;
    this.#modal.oncancel = null;
    this.#modal.close();
    this.#modal.replaceChildren();
    this.element.shadowRoot!.replaceChildren();
    this.element.remove();
  }

  async collect(input: ExportOptions): Promise<void> {
    if (this.#controller || this.#state.val.phase === "disposed") return;
    const controller = new AbortController();
    this.#controller = controller;
    let retained = this.#state.val.result;
    try {
      // 选项和请求初始化成功后才放弃上次结果。
      const options = validateOptions(input);
      const source = this.#services.source();
      retained = null;
      this.#update("collecting", {
        result: null,
        progress: null,
        error: "",
        status: "正在读取订单…",
      });
      let result: ReadonlyExportResult | undefined;
      for await (const event of this.#services.collect(
        source,
        options,
        controller.signal,
      )) {
        if (controller !== this.#controller) return;
        if (event.type === "result") result = event.result;
        else if (!controller.signal.aborted) {
          this.#update("collecting", {
            progress: event.progress,
            status: describeProgress(event.progress.current),
          });
        }
      }
      if (controller !== this.#controller) return;
      if (!result) throw new Error("Collection ended without a result");
      this.#controller = null;
      this.#update("ready", {
        result,
        progress: result.progress,
        error: "",
        status:
          result.complete && !result.entries.length
            ? "未找到订单，请调整日期范围。"
            : (result.complete ? "" : "结果不完整。") + describeResult(result),
      });
    } catch (error) {
      if (controller !== this.#controller) return;
      this.#controller = null;
      this.#update("failed", {
        result: retained,
        progress: retained?.progress ?? null,
        status: "未能完成收集。",
        error: describeError(error),
      });
    }
  }

  /** 继续消费生成器，直至收到保留部分数据的最终结果。 */
  cancel = (): void => {
    if (!this.#controller || this.#state.val.phase === "cancelling") return;
    this.#controller.abort();
    this.#update("cancelling", { status: "正在停止收集…" });
  };

  export(format: FileFormat): void {
    const { result, running, phase } = this.#state.val;
    if (phase === "disposed" || running || !result?.entries.length) return;
    let file;
    try {
      // CSV 校验失败不影响原始 JSON 备份。
      file = exportFile(result, format);
    } catch {
      this.#update(phase, {
        error:
          format === "csv"
            ? "CSV 生成失败，请尝试导出 JSON。"
            : "JSON 生成失败，请稍后重试。",
      });
      return;
    }
    try {
      this.#services.download(file);
      const message = `已发起${result.complete ? "" : "部分"} ${format.toUpperCase()} 导出，请查看浏览器下载列表。`;
      this.#update(phase, {
        error: "",
        status: message,
      });
    } catch {
      this.#update(phase, {
        error: "无法发起下载，请检查浏览器下载权限后重试。",
      });
    }
  }

  #open = () => {
    this.#modal.showModal();
    this.#launcher.hidden = true;
  };
  #close = () => {
    this.cancel();
    this.#modal.close();
  };
  #onClose = () => {
    if (this.#modal.open) return;
    this.cancel();
    this.#launcher.hidden = false;
    this.#launcher.focus({ preventScroll: true });
  };

  #update(
    phase: ViewState["phase"],
    changes: Partial<
      Pick<ViewState, "status" | "error" | "progress" | "result">
    >,
  ): void {
    if (this.#state.rawVal.phase === "disposed") return;
    const state: ViewState = {
      ...this.#state.rawVal,
      ...changes,
      phase,
      running: phase === "collecting" || phase === "cancelling",
    };
    this.#state.val = state;
    this.#collection.mode =
      phase === "cancelling"
        ? "stopping"
        : state.running
          ? "collecting"
          : state.result
            ? "ready"
            : "idle";
    const { running, status, error, progress, result } = state;
    this.#results.data = { running, status, error, progress, result };
  }
}

type CollectionMode = "idle" | "collecting" | "stopping" | "ready";

/** 控件持有草稿，mode 控制操作状态，事件向宿主请求任务。 */
export class CollectionForm {
  readonly element: HTMLFormElement;
  readonly #mode = van.state<CollectionMode>("idle");
  readonly #scope = van.state("");
  readonly #startDate = input({ name: "startDate", type: "date" });
  readonly #endDate = input({ name: "endDate", type: "date" });
  readonly #pageSize = input({
    name: "pageSize",
    type: "number",
    value: "20",
    min: 1,
    max: 50,
    step: 1,
    required: true,
  });
  readonly #maxPages = input({
    name: "maxPages",
    type: "number",
    value: "100",
    min: 1,
    max: 500,
    step: 1,
    required: true,
  });
  readonly #includeDetails = input({
    name: "includeDetails",
    type: "checkbox",
    checked: true,
  });
  readonly #settings: HTMLDetailsElement;
  readonly #requests: HTMLDetailsElement;
  readonly #action: HTMLButtonElement;

  constructor() {
    this.#onInput();
    this.#requests = details(
      summary("请求设置"),
      div(
        { class: "fields" },
        label("每页订单数", this.#pageSize),
        label(
          help(
            span("最多读取页数"),
            "达到页数上限时会停止收集，可导出部分结果。",
          ),
          this.#maxPages,
        ),
      ),
    );
    this.#settings = details(
      { class: "settings", open: true },
      summary(
        span("收集设置"),
        small({ class: "scope" }, () => this.#scope.val),
      ),
      fieldset(
        { disabled: () => this.#running },
        div(
          { class: "fields" },
          label(
            { class: "date-field" },
            "开始日期",
            this.#startDate,
            span({ class: "date-placeholder", "aria-hidden": "true" }, "不限"),
          ),
          label(
            { class: "date-field" },
            "结束日期",
            this.#endDate,
            span({ class: "date-placeholder", "aria-hidden": "true" }, "不限"),
          ),
        ),
        label(
          { class: "check" },
          this.#includeDetails,
          help(span("收集详情"), "逐笔读取支付、物流等详情，收集时间会更长。"),
        ),
        this.#requests,
      ),
    );
    this.#action = button(
      {
        class: "action",
        title: () =>
          this.#mode.val === "ready" ? "重新收集会替换当前结果。" : "",
        type: () => (this.#running ? "button" : "submit"),
        disabled: () => this.#mode.val === "stopping",
        onclick: this.#onAction,
      },
      () => this.#actionLabel(),
    );
    this.element = form(
      { oninput: this.#onInput, onsubmit: this.#collect },
      this.#settings,
      this.#action,
    );
    this.element.addEventListener("invalid", this.#showInvalidField, true);
  }

  get mode(): CollectionMode {
    return this.#mode.rawVal;
  }
  set mode(value: CollectionMode) {
    const started =
      value === "collecting" && this.#mode.rawVal !== "collecting";
    this.#mode.val = value;
    if (started) this.#collapse();
  }

  get #running(): boolean {
    return this.#mode.val === "collecting" || this.#mode.val === "stopping";
  }

  #actionLabel(): string {
    return {
      idle: "开始收集",
      ready: "重新收集",
      collecting: "停止并保留结果",
      stopping: "正在停止…",
    }[this.#mode.val];
  }

  #updateScope(): void {
    const start = this.#startDate.value;
    const end = this.#endDate.value;
    const range =
      !start && !end ? "不限日期" : `${start || "不限"} 至 ${end || "不限"}`;
    this.#scope.val =
      range + (this.#includeDetails.checked ? " · 含详情" : " · 仅列表");
  }

  #onInput = () => {
    for (const date of [this.#startDate, this.#endDate]) {
      date.toggleAttribute(
        "data-empty",
        !date.value && !date.validity.badInput,
      );
    }
    this.#endDate.setCustomValidity(
      this.#startDate.value &&
        this.#endDate.value &&
        this.#startDate.value > this.#endDate.value
        ? "结束日期不能早于开始日期。"
        : "",
    );
    this.#updateScope();
  };

  #showInvalidField = (event: Event) => {
    this.#settings.open = true;
    if (event.target === this.#pageSize || event.target === this.#maxPages)
      this.#requests.open = true;
  };

  #collect = (event: Event) => {
    event.preventDefault();
    this.#onInput();
    if (this.#running || !this.element.reportValidity()) return;
    this.element.dispatchEvent(
      new CustomEvent<ExportOptions>("collect", {
        bubbles: true,
        detail: {
          startDate: this.#startDate.value,
          endDate: this.#endDate.value,
          pageSize: this.#pageSize.valueAsNumber,
          maxPages: this.#maxPages.valueAsNumber,
          includeDetails: this.#includeDetails.checked,
        },
      }),
    );
  };

  #onAction = (event: Event) => {
    if (!this.#running) return;
    event.preventDefault();
    this.element.dispatchEvent(new Event("stop", { bubbles: true }));
  };

  #collapse(): void {
    const moveFocus = this.#settings.matches(":focus-within");
    this.#settings.open = false;
    if (moveFocus) this.#action.focus({ preventScroll: true });
  }
}

interface ExportResultsData {
  readonly running: boolean;
  readonly status: string;
  readonly error: string;
  readonly progress: Readonly<Progress | LiveProgress> | null;
  readonly result: ReadonlyExportResult | null;
}

/** 接收普通业务数据，自行生成统计、范围和导出标记。 */
export class ExportResults {
  readonly element: HTMLElement;
  readonly #progress = progress();
  readonly #data = van.state<ExportResultsData>({
    running: false,
    status: "",
    error: "",
    progress: null,
    result: null,
  });

  constructor() {
    this.element = section(
      { "aria-label": "收集结果", hidden: () => !this.#visible },
      h3(() => (this.#data.val.running ? "收集进度" : "收集结果")),
      p(
        { role: "alert", hidden: () => !this.#data.val.error },
        () => this.#data.val.error,
      ),
      p(
        { role: "status", hidden: () => Boolean(this.#data.val.error) },
        () => this.#data.val.status,
      ),
      () => this.#updateProgress(),
      p({ class: "counts" }, () => this.#countText()),
      p({ hidden: () => !this.#data.val.result }, () => this.#resultRange()),
      div(
        { class: "exports", hidden: () => !this.#canExport },
        (["csv", "json"] as const).map((format) =>
          help(
            button(
              { type: "button", onclick: () => this.#export(format) },
              () => this.#exportLabel(format),
            ),
            ...(format === "csv"
              ? [
                  "CSV 账单表格，金额未扣退款。",
                  "订单号、快递单号请按文本导入。",
                ]
              : [
                  "JSON 包含订单与详情。",
                  "可能含地址、手机号等个人信息，请妥善保管。",
                  "大整数可能有精度损失。",
                ]),
          ),
        ),
      ),
    );
  }

  get data(): ExportResultsData {
    return this.#data.rawVal;
  }
  set data(value: ExportResultsData) {
    this.#data.val = value;
  }

  #updateProgress(): HTMLProgressElement {
    const { running, progress } = this.#data.val;
    this.#progress.hidden = !running;
    if (
      progress &&
      "current" in progress &&
      progress.current.kind === "details"
    ) {
      const { page, completed, total } = progress.current;
      this.#progress.max = total;
      this.#progress.value = completed;
      this.#progress.setAttribute(
        "aria-label",
        `第 ${page} 页详情读取进度：${completed}/${total}`,
      );
    } else {
      this.#progress.removeAttribute("value");
      this.#progress.setAttribute("aria-label", "列表读取进度：总页数未知");
    }
    return this.#progress;
  }

  get #visible(): boolean {
    const { running, status, error, progress, result } = this.#data.val;
    return Boolean(running || status || error || progress || result);
  }

  get #canExport(): boolean {
    return (
      !this.#data.val.running && Boolean(this.#data.val.result?.entries.length)
    );
  }

  #countText(): string {
    const counts = this.#data.val.progress;
    return counts
      ? `已读 ${counts.pages} 页 · 检查 ${counts.scanned} 笔 · 保留 ${counts.selected} 笔`
      : "";
  }

  #resultRange(): string {
    const options = this.#data.val.result?.options;
    return options
      ? `结果日期：${options.startDate || "不限"} 至 ${options.endDate || "不限"}`
      : "";
  }

  #exportLabel(format: FileFormat): string {
    return `导出${this.#data.val.result?.complete ? "" : "部分"} ${format.toUpperCase()}`;
  }

  #export(format: FileFormat): void {
    if (this.#canExport)
      this.element.dispatchEvent(
        new CustomEvent<FileFormat>("export", {
          bubbles: true,
          detail: format,
        }),
      );
  }
}

/** 标签或按钮本身触发说明；列表、层级和定位交给原生元素与 CSS。 */
function help(anchor: HTMLElement, ...items: string[]): HTMLElement {
  const id = `pdd-help-${crypto.randomUUID()}`;
  const popup = div(
    { id, class: "help-popup", popover: "auto", role: "tooltip" },
    items.length === 1 ? items[0] : ul(items.map((text) => li(text))),
  );
  anchor.classList.add("help-anchor");
  anchor.setAttribute("aria-describedby", id);
  if (anchor.tabIndex < 0) anchor.tabIndex = 0;
  const show = () => popup.showPopover({ source: anchor });
  const hide = () => {
    if (!anchor.matches(":hover, :focus")) popup.hidePopover();
  };
  return span(
    {
      class: "help",
      onmouseenter: show,
      onmouseleave: hide,
      onfocusin: show,
      onfocusout: hide,
    },
    anchor,
    popup,
  );
}

function describeProgress(current: Readonly<LiveProgress["current"]>): string {
  return current.kind === "details"
    ? `第 ${current.page} 页详情：已处理 ${current.completed}/${current.total}`
    : `正在读取第 ${current.page} 页列表，总页数未知。`;
}

function describeError(error: unknown): string {
  if (error instanceof PddError) return error.message;
  if (!(error instanceof InputError)) return "操作失败，请稍后重试。";
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

function describeResult(result: ReadonlyExportResult): string {
  const messages: Record<StopReason, string> = {
    end: "已读取到订单列表末尾。",
    range: "所选日期范围已收集完成。",
    limit: "已达到页数上限。",
    cancelled: "收集已停止，已保留收到的订单。",
    failed: "请求失败，保留已获取的结果。",
  };
  return result.error ?? messages[result.reason];
}
