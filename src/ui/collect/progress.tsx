import { h } from "preact";

/** 按消费方已收到的数据展示进度，总量未知时使用原生不定进度条。 */
export function CollectProgress({ cancelling, counts }: CollectProgressProps) {
  const page = counts?.currentPage;
  const determinate = page !== null && page !== undefined && page.total > 0;
  return (
    <section data-ui="collect-progress" aria-label="收集进度">
      <h3>收集进度</h3>
      <p role="status">
        {cancelling
          ? "正在停止收集…"
          : page
            ? `正在处理第 ${counts?.pages ?? 1} 页订单（${page.completed}/${page.total}）…`
            : `正在读取第 ${(counts?.pages ?? 0) + 1} 页订单…`}
      </p>
      <progress
        aria-label={
          determinate ? "本页订单读取进度" : "订单分页读取进度：总量未知"
        }
        value={determinate ? page.completed : undefined}
        max={determinate ? page.total : undefined}
      />
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
  readonly currentPage: {
    readonly completed: number;
    readonly total: number;
  } | null;
}

interface CollectProgressProps {
  cancelling: boolean;
  counts: CollectCounts | null;
}
