import { defineCustomElement } from "vue";
import { ExportPanel } from "./ui";

const hostId = "pdd-order-export";

// SFC 样式由 Vue 注入唯一的 Shadow Root；内部仍是普通 Vue 组件。
if (!document.getElementById(hostId)) {
  const tag = "pdd-export-panel";
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(ExportPanel));
  }
  const host = document.createElement(tag);
  host.id = hostId;
  document.body.append(host);
}
