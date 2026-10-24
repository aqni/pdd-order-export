import type { CollectDraft } from "./settings";

export function CollectDetailsOption({ draft }: { draft: CollectDraft }) {
  return (
    <label
      data-ui="collect-details"
      title="逐笔读取订单详情以补充支付、下单时间和物流信息，收集时间会更长。"
    >
      <input
        type="checkbox"
        name="includeDetails"
        v-model={draft.includeDetails}
      />{" "}
      收集详情
    </label>
  );
}
