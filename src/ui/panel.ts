import { createPanelSession, type SessionDependencies } from "./session";
import { createPanelView } from "./view";
import type { ExportOptions } from "../collect";
import type { FileFormat } from "../export";

const tag = "pdd-order-export-panel";
const id = "pdd-order-export";

/** 接入文档时创建会话，宿主被移除时取消任务并清理视图。 */
export class OrderExportPanel extends HTMLElement {
  dependencies: Partial<SessionDependencies> = {};
  #disconnect?: () => void;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.isConnected && !this.#disconnect) {
      const root = this.shadowRoot!;
      const view = createPanelView(root);
      const session = createPanelSession(view.update, this.dependencies);
      view.form.addEventListener("collect-request", (event) => {
        void session.collect((event as CustomEvent<ExportOptions>).detail);
      });
      view.form.addEventListener("collect-cancel", () => session.cancel());
      view.result.addEventListener("export-request", (event) => {
        session.export((event as CustomEvent<FileFormat>).detail);
      });
      this.#disconnect = () => {
        session.dispose();
        view.close();
        root.replaceChildren();
      };
    }
  }

  disconnectedCallback() {
    this.#disconnect?.();
    this.#disconnect = undefined;
  }
}

if (!customElements.get(tag)) {
  customElements.define(tag, OrderExportPanel);
}

/** 挂载唯一面板，返回仅移除本次挂载实例的清理函数。 */
export function mountPanel(
  dependencies: Partial<SessionDependencies> = {},
): () => void {
  if (document.getElementById(id)) {
    return () => {};
  }
  const panel = document.createElement(tag) as OrderExportPanel;
  panel.id = id;
  panel.dependencies = dependencies;
  document.body.append(panel);
  return () => panel.remove();
}
