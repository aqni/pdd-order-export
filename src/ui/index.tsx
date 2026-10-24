import { Component, createRef, h } from "preact";
import { CollectControls, type CollectResult } from "./collect";
import { ExportControls } from "./export";
import { ExportDialog } from "./dialog";

/** 只连接区域接口；收集任务和结果分别由各自组件持有。 */
export class ExportPanel extends Component {
  readonly #exports = createRef<ExportControls>();

  render() {
    return (
      <div data-ui="panel">
        <ExportDialog>
          <CollectControls onStart={this.#onStart} onFinish={this.#onFinish} />
          <ExportControls ref={this.#exports} />
        </ExportDialog>
      </div>
    );
  }

  #onStart = () => {
    this.#exports.current!.setResult(null);
  };
  #onFinish = (result: CollectResult | null) => {
    this.#exports.current!.setResult(result);
  };
}
