import { Component, createRef, createElement } from "preact";
import { CollectControls, type CollectResult } from "./collect/controls";
import { ExportControls } from "./export/controls";
import { ExportDialog } from "./dialog";

/** UI 入口只协调阶段和结果快照，收集、取消及文件操作由子组件拥有。 */
export class ExportPanel extends Component<
  Record<string, never>,
  ExportPanelState
> {
  state: ExportPanelState = { phase: "idle", result: null };
  readonly #collect = createRef<CollectControls>();

  render(_props: Record<string, never>, { phase, result }: ExportPanelState) {
    return (
      <ExportDialog
        running={phase === "collecting"}
        onDismiss={this.#cancelCollect}
      >
        <CollectControls
          ref={this.#collect}
          onStart={this.#onStart}
          onFinish={this.#onFinish}
        />
        <hr hidden={phase !== "exporting"} />
        {phase === "exporting" && result !== null && (
          <ExportControls result={result} />
        )}
      </ExportDialog>
    );
  }

  #onStart = () => {
    this.setState({ phase: "collecting", result: null });
  };
  #onFinish = (result: CollectResult | null) => {
    this.setState({ phase: result === null ? "idle" : "exporting", result });
  };
  #cancelCollect = () => {
    this.#collect.current?.cancel();
  };
}

interface ExportPanelState {
  phase: "idle" | "collecting" | "exporting";
  result: CollectResult | null;
}
