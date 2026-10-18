import Papa from "papaparse";
import { test, expect } from "./fixtures";

test("installed userscript collects first and exports only on request", async ({
  shop,
}) => {
  const { page, dialog, fixture, downloads, file } = shop;
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "开始收集" }).click();
  await expect
    .poll(() =>
      dialog.getByRole("button", { name: "导出 CSV", exact: true }).isEnabled(),
    )
    .toBe(true);
  expect(downloads).toHaveLength(0);
  const csvDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出 CSV", exact: true }).click();
  const csv = await file(await csvDownload);
  expect([...csv.bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect(csv.name).toMatch(/^拼多多账单_不限至不限_.*Z\.csv$/);
  const parsed = Papa.parse<{ 订单编号: string }>(csv.bytes.toString(), {
    header: true,
  });
  expect(parsed.errors).toEqual([]);
  expect(parsed.data.map((row) => row.订单编号)).toEqual(
    fixture.orders.map((order) => order.order_sn),
  );
  const jsonDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出 JSON", exact: true }).click();
  const jsonFile = await file(await jsonDownload);
  expect(jsonFile.name).toBe(csv.name.replace(/\.csv$/, ".json"));
  expect(downloads).toHaveLength(2);
  const json = JSON.parse(jsonFile.bytes.toString());
  expect(json).toMatchObject({ complete: true, reason: "end" });
  expect(json.entries.map((entry: { order: unknown }) => entry.order)).toEqual(
    fixture.orders,
  );
  expect(
    json.entries.map(
      (entry: { detail: { marker: string } }) => entry.detail.marker,
    ),
  ).toEqual(fixture.orders.map((order) => order.order_sn));
  await page.goto("https://mobile.pinduoduo.com/other.html");
  expect(await page.getByRole("button", { name: "导出账单" }).count()).toBe(0);
});

test("closing keeps the task alive; cancelling a blocked detail retains every received sibling", async ({
  shop,
}) => {
  const { page, dialog, fixture, downloads, file, release } = shop;
  fixture.holdDetails = true;
  await dialog.getByRole("button", { name: "开始收集" }).click();
  await expect.poll(() => fixture.requests.length).toBe(2);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "订单收集中…" }).click();
  expect(await page.getByLabel("开始日期").isDisabled()).toBe(true);
  await dialog.getByRole("button", { name: "停止并保留结果" }).click();
  const exportJson = dialog.getByRole("button", {
    name: "导出部分 JSON（不完整）",
  });
  await expect(exportJson).toBeEnabled();
  release();
  expect(downloads).toHaveLength(0);
  const partialDownload = page.waitForEvent("download");
  await exportJson.click();
  const exported = await file(await partialDownload);
  expect(exported.name).toMatch(/_不完整\.json$/);
  const json = JSON.parse(exported.bytes.toString());
  expect(json).toMatchObject({ reason: "cancelled", complete: false });
  expect(json.entries.map((entry: { order: unknown }) => entry.order)).toEqual(
    fixture.orders,
  );
  expect(
    json.entries.every((entry: { detail: unknown }) => entry.detail === null),
  ).toBe(true);
  expect(fixture.requests).toHaveLength(2);
});

test("CSV failure explains the JSON fallback and keeps the collected data", async ({
  shop,
}) => {
  const { page, dialog, fixture, downloads, file } = shop;
  fixture.orders[0]!.order_amount = -1;
  await dialog.getByRole("button", { name: "开始收集" }).click();
  const csv = dialog.getByRole("button", { name: "导出 CSV", exact: true });
  await expect(csv).toBeEnabled();
  await csv.click();
  const alert = dialog.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toHaveText("CSV 生成失败，请尝试导出 JSON。");
  expect(downloads).toHaveLength(0);
  const json = dialog.getByRole("button", { name: "导出 JSON", exact: true });
  await expect(json).toBeEnabled();
  const download = page.waitForEvent("download");
  await json.click();
  const exported = JSON.parse((await file(await download)).bytes.toString());
  expect(
    exported.entries.map((entry: { order: unknown }) => entry.order),
  ).toEqual(fixture.orders);
  await expect(alert).toBeHidden();
  await expect(dialog.getByRole("status")).toHaveText(
    "已发起 JSON 导出，请查看浏览器下载列表。",
  );
});

test("denied detail access shows a login hint and allows exporting retained orders", async ({
  shop,
}) => {
  const { page, dialog, fixture, downloads, file } = shop;
  await page.route("**/order.html?*", (route) =>
    route.fulfill({
      status: 403,
      body: "Internal response details must not appear in the UI",
    }),
  );
  await dialog.getByRole("button", { name: "开始收集" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "结果不完整。登录已失效或访问被拒绝，请在当前页面重新登录。",
  );
  await expect(dialog.getByRole("button", { name: "开始收集" })).toBeEnabled();
  await expect(dialog).not.toContainText("Internal response details");
  expect(downloads).toHaveLength(0);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出部分 JSON（不完整）" }).click();
  const exported = JSON.parse((await file(await download)).bytes.toString());
  expect(exported).toMatchObject({ reason: "failed", complete: false });
  expect(
    exported.entries.map((entry: { order: unknown }) => entry.order),
  ).toEqual(fixture.orders);
  expect(
    exported.entries.every(
      (entry: { detail: unknown }) => entry.detail === null,
    ),
  ).toBe(true);
});
