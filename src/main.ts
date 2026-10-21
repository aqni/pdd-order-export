import { OrderExportView } from "./view";

const id = "pdd-order-export";

// @run-at document-end 保证 DOM 已解析。
if (!document.getElementById(id)) {
  const view = new OrderExportView();
  view.element.id = id;
  document.body.append(view.element);
  import.meta.hot?.dispose(() => view.dispose());
}
