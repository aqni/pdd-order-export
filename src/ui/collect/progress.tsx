import { createElement } from "preact";

/** 按消费方已收到的数据展示进度，总量未知时使用原生不定进度条。 */
export function CollectProgress({
  active,
  cancelling,
  counts,
}: CollectProgressProps) {
  return (
    <section aria-label="收集进度">
      <h3>收集进度</h3>
      {active && (
        <p role="status">
          {cancelling
            ? "正在停止收集…"
            : `正在读取第 ${counts?.pages || 1} 页订单…`}
        </p>
      )}
      <progress hidden={!active} aria-label="订单读取进度：总量未知" />
      <p class="counts">
        {counts &&
          `已读 ${counts.pages} 页 · 保留 ${counts.orders} 笔 · 详情 ${counts.details} 笔`}
      </p>
    </section>
  );
}

export interface CollectCounts {
  readonly pages: number;
  readonly orders: number;
  readonly details: number;
}

interface CollectProgressProps {
  active: boolean;
  cancelling: boolean;
  counts: CollectCounts | null;
}
