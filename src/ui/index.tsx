import { defineComponent, shallowRef } from "vue";
import { CollectControls, type CollectResult } from "./collect";
import { ExportControls } from "./export";
import { ExportDialog } from "./dialog";

/** 结果以浅引用保存，不代理订单数据；进度更新留在收集区域。 */
export const ExportPanel = defineComponent(() => {
  const result = shallowRef<CollectResult | null>(null);
  const setResult = (value: CollectResult | null) => {
    result.value = value;
  };

  return () => (
    <div data-ui="panel">
      <ExportDialog>
        <CollectControls onStart={() => setResult(null)} onFinish={setResult} />
        <ExportControls result={result.value} />
      </ExportDialog>
    </div>
  );
});
