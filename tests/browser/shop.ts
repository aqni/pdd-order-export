import assert from "node:assert/strict";
import type { Route } from "playwright";

/** Site behavior is separate from browser installation and test interactions. */
export function createShop() {
  const uid = "123";
  const fixture = {
    orders: [
      { order_sn: "261017-a", offset: "cursor:a", order_amount: 199 },
      { order_sn: "261017-b", offset: "cursor:b", order_amount: 0 },
    ],
    holdDetails: false,
    requests: [] as { method: string; path: string; body: unknown }[],
    errors: [] as string[],
  };
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  return {
    fixture,
    release,
    uid,
    async handle(route: Route) {
      const request = route.request();
      const url = new URL(request.url());
      if (["/orders.html", "/other.html"].includes(url.pathname)) {
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Synthetic shop</title><style>button,input{font-size:35px}</style>",
        });
      }
      if (url.pathname === "/favicon.ico") {
        return route.fulfill({ status: 404 });
      }
      fixture.requests.push({
        method: request.method(),
        path: url.pathname,
        body: request.postData() ? request.postDataJSON() : null,
      });
      if (url.pathname === "/proxy/api/api/aristotle/order_list_v4") {
        assert.equal(request.method(), "POST");
        assert.equal(url.searchParams.get("pdduid"), uid);
        assert(request.headers()["cookie"]?.includes("pdd_user_id=" + uid));
        const body = request.postDataJSON();
        assert.equal(body.size, 10);
        if (body.offset !== undefined) {
          assert.equal(body.offset, fixture.orders.at(-1)!.offset);
        }
        return route.fulfill({
          json: { orders: body.offset === undefined ? fixture.orders : [] },
        });
      }
      if (url.pathname === "/order.html") {
        const order = fixture.orders.find(
          (order) => order.order_sn === url.searchParams.get("order_sn"),
        );
        assert(order);
        const detail = {
          orderSn: order.order_sn,
          orderDescList: [],
          marker: order.order_sn,
        };
        if (fixture.holdDetails) {
          await gate;
        }
        try {
          return await route.fulfill({
            contentType: "text/html",
            body:
              "<script>window.rawData=" +
              JSON.stringify({ data: detail }) +
              ";</script>",
          });
        } catch (error) {
          if (!fixture.holdDetails) {
            throw error;
          }
        }
        return;
      }
      throw new Error(
        "Unexpected request: " + request.method() + " " + url.pathname,
      );
    },
  };
}
