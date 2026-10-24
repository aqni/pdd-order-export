import { createApp } from "vue";
import { ExportPanel } from "./ui";
import stylesheet from "./ui/styles.css?style";

const hostId = "pdd-order-export";

// @run-at document-end 保证 DOM 已解析。
if (!document.getElementById(hostId)) {
  const host = document.createElement("div");
  const mountNode = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.append(stylesheet.cloneNode(true), mountNode);
  host.id = hostId;
  const app = createApp(ExportPanel);
  app.mount(mountNode);
  document.body.append(host);
  import.meta.hot?.dispose(() => {
    app.unmount();
    shadow.replaceChildren();
    host.remove();
  });
}
