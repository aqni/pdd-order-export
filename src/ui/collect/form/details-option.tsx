import { h } from "preact";

export function CollectDetailsOption({ checked }: { checked: boolean }) {
  return (
    <label
      data-ui="collect-details"
      title="逐笔读取订单详情以补充支付、下单时间和物流信息，收集时间会更长。"
    >
      <input type="checkbox" name="includeDetails" checked={checked} /> 收集详情
    </label>
  );
}
