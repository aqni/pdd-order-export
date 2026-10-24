import { Component, h, createRef } from "preact";

export class CollectDetailsOption extends Component {
  readonly #input = createRef<HTMLInputElement>();
  get checked() {
    return this.#input.current!.checked;
  }
  render() {
    return (
      <label
        data-ui="collect-details"
        title="逐笔读取订单详情以补充支付、下单时间和物流信息，收集时间会更长。"
      >
        <input
          ref={this.#input}
          type="checkbox"
          name="includeDetails"
          defaultChecked
        />{" "}
        收集详情
      </label>
    );
  }
}
