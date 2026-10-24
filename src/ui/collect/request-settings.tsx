import { Component, createRef, createElement } from "preact";

/** 请求参数及其原生校验提示归属同一个可折叠区域。 */
export class CollectRequestSettings extends Component {
  readonly #details = createRef<HTMLDetailsElement>();

  render() {
    return (
      <details ref={this.#details} onInvalidCapture={this.#showInvalidField}>
        <summary>请求设置</summary>
        <div class="fields">
          <label>
            每页订单数
            <input
              name="pageSize"
              type="number"
              defaultValue="20"
              min={1}
              max={50}
              step={1}
              required
            />
          </label>
          <label title="达到页数上限时会停止收集，可导出部分结果。">
            最多读取页数
            <input
              name="maxPages"
              type="number"
              defaultValue="100"
              min={1}
              step={1}
              required
            />
          </label>
        </div>
      </details>
    );
  }

  #showInvalidField = () => {
    this.#details.current!.open = true;
  };
}
