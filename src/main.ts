import { ExportPanel } from "./ui";
const hostId = "pdd-order-export";
// @run-at document-end 保证 DOM 已解析。
if (!document.getElementById(hostId)) {
  const panel = new ExportPanel();
  panel.id = hostId;
  document.body.append(panel);
}
// 自定义元素不能重复注册，不接受模块热替换，由 Vite 整页刷新。
