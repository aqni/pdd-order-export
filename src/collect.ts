import { createIs, createAssert, type tags } from "typia";
import type { PddClient, Order, OrderDetail } from "./pdd";

export interface CollectedOrder {
  readonly order: Order;
  /** 未请求详情。 */
  readonly detail: OrderDetail | null;
}

/** 外层按需分页并筛选，内层按配置获取详情；消费方自行保存已产出的条目。 */
export async function* collectOrders(
  source: Pick<PddClient, "getOrders" | "getOrderDetail">,
  collectionOptions: CollectionOptions,
  signal: AbortSignal,
): AsyncGenerator<OrderPage, void, void> {
  const { startDate, endDate, pageSize, maxPages, includeDetails } =
    assertCollectionOptions(collectionOptions);
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const orders = await source.getOrders(cursor, pageSize, signal);
    if (orders.length === 0) return;
    const { selectedOrders, reachedStart } = selectPageOrders(
      orders,
      startDate,
      endDate,
    );
    yield collectPageOrders(source, selectedOrders, includeDetails, signal);
    if (reachedStart) return;
    // 上游游标不透明，不能从订单号或页数推算。
    cursor = orders.at(-1)!.offset;
  }
}

type CollectionOptions = {
  startDate: Date | null;
  endDate: Date | null;
  pageSize: number & tags.Type<"uint32"> & tags.Maximum<50>;
  maxPages: number & tags.Type<"uint32">;
  includeDetails: boolean;
};

type OrderPage = AsyncGenerator<CollectedOrder, void, void>;

const assertCollectionOptions = createAssert<CollectionOptions>();

function selectPageOrders(
  orders: readonly Order[],
  startDate: Date | null,
  endDate: Date | null,
): { selectedOrders: Order[]; reachedStart: boolean } {
  const selectedOrders: Order[] = [];
  for (const order of orders) {
    if (startDate || endDate) {
      const date = estimateOrderDate(order.order_sn);
      if (startDate && date < startDate)
        return { selectedOrders, reachedStart: true };
      if (endDate && date > endDate) continue;
    }
    selectedOrders.push(order);
  }
  return { selectedOrders, reachedStart: false };
}

async function* collectPageOrders(
  source: Pick<PddClient, "getOrderDetail">,
  orders: readonly Order[],
  includeDetails: boolean,
  signal: AbortSignal,
): OrderPage {
  for (const order of orders) {
    const detail = includeDetails
      ? await source.getOrderDetail(order.order_sn, signal)
      : null;
    yield { order, detail };
  }
}

const isCalendarDateText = createIs<string & tags.Format<"date">>();

/**
 * 从订单号前六位估算订单日期，不等同于支付时间。
 * @throws 无法识别日期或日期不存在时抛出错误。
 */
function estimateOrderDate(id: string): Date {
  const parts = /^(\d{2})(\d{2})(\d{2})-/.exec(id);
  const date = parts ? `20${parts[1]}-${parts[2]}-${parts[3]}` : "";
  if (!isCalendarDateText(date)) {
    throw new Error("无法识别订单日期。");
  }
  return new Date(date);
}
