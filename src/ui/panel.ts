import { createExportSession, type SessionDependencies } from './session';
import { createPanelView } from './view';
import type { ExportRequest } from './model';
import type { FileFormat } from '../core/types';

const tag = 'pdd-order-export-panel';
const id = 'pdd-order-export';

/** Connecting creates a new session; removing the host cancels and discards it. */
export class OrderExportPanel extends HTMLElement {
  dependencies: Partial<SessionDependencies> = {};
  #disconnect?: () => void;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (this.isConnected && !this.#disconnect) {
      const root = this.shadowRoot!;
      const view = createPanelView(root);
      const session = createExportSession(view.update, this.dependencies);
      view.form.addEventListener('export-request', (event) => {
        const { options, format } = (event as CustomEvent<ExportRequest>)
          .detail;
        session.submit(options, format);
      });
      view.form.addEventListener('export-cancel', () => session.cancel());
      view.result.addEventListener('export-download', (event) => {
        session.download((event as CustomEvent<FileFormat>).detail);
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
