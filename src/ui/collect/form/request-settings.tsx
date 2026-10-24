import { Component, h, createRef } from "preact";

export class CollectRequestSettings extends Component {
  readonly #details = createRef<HTMLDetailsElement>();
  readonly #pageSize = createRef<HTMLInputElement>();
  readonly #maxPages = createRef<HTMLInputElement>();
  render() {
    return (
      <details
        data-ui="collect-requests"
        ref={this.#details}
        onInvalidCapture={() => {
          this.#details.current!.open = true;
        }}
      >
        <summary>请求设置</summary>
        <div class="fields">
          <label>
            每页订单数
            <input
              ref={this.#pageSize}
              name="pageSize"
              type="number"
              defaultValue="20"
              min={1}
              max={50}
              required
            />
          </label>
          <label title="达到页数上限时会停止收集，可导出部分结果。">
            最多读取页数
            <input
              ref={this.#maxPages}
              name="maxPages"
              type="number"
              defaultValue="100"
              min={1}
              required
            />
          </label>
        </div>
      </details>
    );
  }
  read() {
    return {
      pageSize: this.#pageSize.current!.valueAsNumber,
      maxPages: this.#maxPages.current!.valueAsNumber,
    };
  }
}
