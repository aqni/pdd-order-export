import { createElement } from "preact";

/** 详情开关是原生表单字段，取值和提交由所属表单完成。 */
export function CollectDetailsOption() {
  return (
    <label class="check" title="逐笔读取支付、物流等详情，收集时间会更长。">
      <input name="includeDetails" type="checkbox" defaultChecked />
      <span>收集详情</span>
    </label>
  );
}
