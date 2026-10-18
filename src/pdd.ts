import {
  parse,
  type ExpressionStatement,
  type AssignmentExpression,
  type MemberExpression,
  type Identifier,
  type ObjectExpression,
} from "acorn";
import { createIs, is, json, type tags } from "typia";
import wretch from "wretch";

/** Only fields used by collection and protocol validation are named. */
export interface Order extends Record<string, unknown> {
  order_sn: string & tags.Pattern<"\\S">;
  offset: string;
}

export interface OrderDetail extends Record<string, unknown> {
  orderSn: string;
}

const isOrderList = createIs<{
  orders: Order[];
}>();

export class PddError extends Error {
  override readonly name = "PddError";

  constructor(
    message: string,
    readonly code: "request" | "session" | "schema" = "request",
  ) {
    super(message);
  }
}

interface PddClientOptions {
  fetch?: typeof globalThis.fetch;
  cookies?: () => string;
}

/** PDD requests and response validation; callers own pagination. */
export class PddClient {
  readonly #http;
  readonly #uid: UserId;

  constructor({
    fetch = (...args) => globalThis.fetch(...args),
    cookies = () => document.cookie,
  }: PddClientOptions = {}) {
    this.#uid = parseUserId(cookies());
    this.#http = createPddRequest(fetch);
  }

  async getOrders(
    offset: string | null,
    size: number,
    signal: AbortSignal,
  ): Promise<Order[]> {
    const { orders } = await this.#http
      .url(
        "/proxy/api/api/aristotle/order_list_v4?" +
          new URLSearchParams({ pdduid: this.#uid }),
      )
      .options({ signal })
      .post(offset === null ? { size } : { size, offset })
      .json((value) => {
        if (!isOrderList(value)) {
          throw new PddError(
            "订单列表格式不符合预期，可能缺少订单编号或分页字段。",
            "schema",
          );
        }
        return value;
      });
    return orders;
  }

  async getOrderDetail(
    order_sn: string,
    signal: AbortSignal,
  ): Promise<OrderDetail> {
    const detail = await this.#http
      .url("/order.html?" + new URLSearchParams({ order_sn }))
      .options({ signal })
      .get()
      .text(parseOrderDetail);
    if (detail.orderSn !== order_sn) {
      throw new PddError("详情内容不符合当前订单，已保留列表数据。", "schema");
    }
    return detail;
  }
}

type UserId = string & tags.Pattern<"^[1-9][0-9]*$">;

function parseUserId(cookies: string): UserId {
  try {
    const ids = [
      ...new Set(
        Array.from(
          cookies.matchAll(/(?:^|;)\s*pdd_user_id=([^;]*)/g),
          ([, value = ""]) => decodeURIComponent(value.trim()),
        ),
      ),
    ];
    if (is<[UserId]>(ids)) {
      return ids[0];
    }
  } catch {
    /* A malformed identity is a session failure. */
  }
  throw new PddError(
    "无法从当前页面 Cookie 读取用户标识，请在当前页面重新登录后重试。",
    "session",
  );
}

function createPddRequest(fetch: typeof globalThis.fetch) {
  return wretch()
    .fetchPolyfill(async (url, options) => {
      const signal = options.signal ?? undefined;
      await scheduler.postTask(() => {}, { delay: 600, signal });
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        let response: Response | undefined;
        try {
          response = await fetch(url, options);
        } catch (error) {
          if (signal?.aborted || attempt === 2) {
            throw error;
          }
        }
        if (
          response &&
          (response.ok || response.status < 500 || attempt === 2)
        ) {
          return response;
        }
        await scheduler.postTask(() => {}, {
          delay: 500 * (attempt + 1),
          signal,
        });
      }
    })
    .options({ credentials: "include", redirect: "error" })
    .customError((error) => {
      if (error.status === 401 || error.status === 403) {
        return new PddError(
          "登录已失效或访问被拒绝，请在当前页面重新登录。",
          "session",
        );
      }
      if (error.status === 429) {
        return new PddError("请求过于频繁，请稍后再试。");
      }
      return new PddError(`请求失败（HTTP ${error.status}），请稍后再试。`);
    })
    .catcher("AbortError", (error) => {
      throw error;
    })
    .catcherFallback((error) => {
      if (error instanceof PddError) {
        throw error;
      }
      throw new PddError("请求失败，请检查网络后重试。");
    });
}

// Reuse Acorn's node tags and source ranges without validating unrelated subtrees.
type RawDataStatement = Pick<ExpressionStatement, "type"> & {
  expression: Pick<AssignmentExpression, "type" | "operator"> & {
    operator: "=";
    left: Pick<MemberExpression, "type" | "computed"> & {
      computed: false;
      object: Pick<Identifier, "type" | "name"> & { name: "window" };
      property: Pick<Identifier, "type" | "name"> & { name: "rawData" };
    };
    right: Pick<ObjectExpression, "type" | "start" | "end">;
  };
};

const isRawDataStatement = createIs<RawDataStatement>();
const parseRawData = json.createIsParse<{
  data: OrderDetail;
}>();

function parseOrderDetail(html: string): OrderDetail {
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const script of document.scripts) {
    try {
      const program = parse(script.text, { ecmaVersion: "latest" });
      for (const statement of program.body) {
        if (!isRawDataStatement(statement)) {
          continue;
        }
        const { right } = statement.expression;
        const payload = parseRawData(script.text.slice(right.start, right.end));
        if (payload) {
          return payload.data;
        }
      }
    } catch {
      // Skip scripts that cannot be parsed as JavaScript or literal JSON.
    }
  }
  throw new PddError(
    "详情页缺少可解析的数据，可能需要重新登录或接口已变更。",
    "schema",
  );
}
