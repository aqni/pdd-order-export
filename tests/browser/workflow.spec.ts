import Papa from "papaparse";
import { test, expect } from "./fixtures";

test("panel dimensions stay compact when the site uses a large root font", async ({
  shop,
}) => {
  const { page, dialog } = shop;
  expect(
    await dialog.evaluate((element) => {
      const styles = (element.getRootNode() as ShadowRoot).querySelectorAll(
        "style",
      );
      return {
        count: styles.length,
        hasRules: Boolean(styles[0]?.sheet?.cssRules.length),
      };
    }),
  ).toEqual({ count: 1, hasRules: true });
  await page.setViewportSize({ width: 1900, height: 900 });
  const normalWidth = (await dialog.boundingBox())!.width;
  await page.addStyleTag({
    content:
      ":root { font-size: 100px !important; } #pdd-order-export { font-family: serif !important; }",
  });
  expect(
    await dialog.evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("system-ui");
  await expect
    .poll(async () => (await dialog.boundingBox())!.width)
    .toBeCloseTo(normalWidth, 0);
  await page.screenshot({ path: test.info().outputPath("desktop.png") });
  await dialog.getByText("请求设置", { exact: true }).click();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: test.info().outputPath("expanded.png") });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 568 });
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(width - 24);
    expect(Math.abs(bounds.x - (width - bounds.width) / 2)).toBeLessThan(2);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath("mobile.png") });
});

test("native descriptions preserve control interactions and progress is indeterminate", async ({
  shop,
}) => {
  const { page, dialog, fixture, release } = shop;
  const details = dialog.getByRole("checkbox", { name: "收集详情" });
  await expect(details.locator("..")).toHaveAttribute(
    "title",
    /收集时间会更长/,
  );
  await dialog.getByText("收集详情", { exact: true }).click();
  await expect(details).not.toBeChecked();
  await details.focus();
  await page.keyboard.press("Space");
  await expect(details).toBeChecked();
  await dialog.getByText("请求设置", { exact: true }).click();
  await expect(
    dialog.getByLabel("最多读取页数", { exact: true }).locator(".."),
  ).toHaveAttribute("title", /页数上限/);
  fixture.holdDetails = true;
  await dialog.getByRole("button", { name: "开始收集", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => fixture.requests.length).toBe(2);
  await expect(dialog.getByRole("progressbar")).not.toHaveAttribute("value");
  await expect(dialog.getByRole("heading", { name: "收集进度" })).toBeVisible();
  fixture.holdDetails = false;
  release();
  const json = dialog.getByRole("button", {
    name: "导出 JSON",
    exact: true,
  });
  await expect(json).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "收集进度", exact: true }),
  ).toBeHidden();
  await expect(
    dialog.getByRole("region", { name: "收集结果", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("progressbar")).toHaveCount(0);
  await expect(json).toHaveAttribute(
    "title",
    /订单与详情数据。\n\n.*个人信息.*精度损失/,
  );
  await expect(
    dialog.getByRole("button", { name: "导出 CSV", exact: true }),
  ).toHaveAttribute("title", /未扣除退款。\n\n.*设为文本/);
  await expect(json).toBeEnabled();
  await json.focus();
  await expect(json).toBeFocused();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "关闭", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
});

test("starting collection from a focused field moves focus to the stop button", async ({
  shop,
}) => {
  const { dialog, fixture } = shop;
  fixture.holdDetails = true;
  await dialog.getByText("请求设置", { exact: true }).click();
  await dialog.getByLabel("每页订单数", { exact: true }).focus();
  await dialog
    .locator("form")
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  const stop = dialog.getByRole("button", {
    name: "停止并保留结果",
    exact: true,
  });
  await expect(stop).toBeFocused();
  await expect(dialog.locator(".settings")).not.toHaveAttribute("open");
  await stop.click();
});

test("installed userscript collects first and exports only on request", async ({
  shop,
}) => {
  const { page, dialog, fixture, downloads, file } = shop;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("region", { name: "收集结果" })).toBeHidden();
  await expect(dialog.getByLabel("开始日期")).toHaveValue("");
  await expect(dialog.getByLabel("结束日期")).toHaveValue("");
  await expect(dialog.getByLabel("每页订单数")).toHaveValue("20");
  await expect(
    dialog.getByRole("button", { name: "不限日期", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.locator(".date-placeholder").filter({ visible: true }),
  ).toHaveCount(2);
  expect(
    await dialog.evaluate((element) => {
      const root = element.getRootNode() as ShadowRoot;
      return {
        launcher: getComputedStyle(root.querySelector(".launcher")!).position,
        native: element instanceof HTMLDialogElement,
      };
    }),
  ).toEqual({ launcher: "fixed", native: true });
  expect(
    await dialog.evaluate((element) => {
      return element.scrollWidth <= element.clientWidth;
    }),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath("panel.png") });
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出账单", exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("launcher.png") });
  await page.getByRole("button", { name: "导出账单", exact: true }).click();
  await dialog.getByRole("button", { name: "开始收集" }).click();
  await expect
    .poll(() =>
      dialog.getByRole("button", { name: "导出 CSV", exact: true }).isEnabled(),
    )
    .toBe(true);
  expect(downloads).toHaveLength(0);
  const requestCount = fixture.requests.length;
  await expect(
    dialog.getByRole("button", { name: "重新收集", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("开始日期")).toBeHidden();
  await dialog.getByText("收集设置", { exact: true }).click();
  await dialog.getByLabel("开始日期").fill("2026-10-17");
  await expect(
    dialog.getByText("结果日期：不限 至 不限", { exact: true }),
  ).toBeVisible();
  expect(fixture.requests).toHaveLength(requestCount);
  const csvDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出 CSV", exact: true }).click();
  const csv = await file(await csvDownload);
  expect([...csv.bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect(csv.name).toBe("拼多多账单_不限至不限.csv");
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
  expect(Array.isArray(json)).toBe(true);

  expect(json.map((entry: { order: unknown }) => entry.order)).toEqual(
    fixture.orders,
  );
  expect(
    json.map((entry: { detail: { marker: string } }) => entry.detail.marker),
  ).toEqual(fixture.orders.map((order) => order.order_sn));
  await page.goto("https://mobile.pinduoduo.com/other.html");
  expect(await page.getByRole("button", { name: "导出账单" }).count()).toBe(0);
});

test("recollection validates drafts before replacing the result and keeps the new partial range", async ({
  shop,
}) => {
  const { page, dialog, fixture, downloads, file } = shop;
  await dialog.getByRole("button", { name: "开始收集" }).click();
  await expect(
    dialog.getByRole("button", { name: "导出 JSON", exact: true }),
  ).toBeVisible();
  const previousRequests = fixture.requests.length;
  await dialog.getByText("收集设置", { exact: true }).click();
  await dialog.getByText("请求设置", { exact: true }).click();
  await dialog.getByLabel("每页订单数").fill("0");
  await dialog.getByText("请求设置", { exact: true }).click();
  await dialog.getByText("收集设置", { exact: true }).click();
  await dialog.getByRole("button", { name: "重新收集", exact: true }).click();
  await expect(dialog.getByLabel("每页订单数")).toBeVisible();
  await expect(dialog.getByLabel("每页订单数")).toBeFocused();
  expect(fixture.requests).toHaveLength(previousRequests);
  await expect(
    dialog.getByRole("button", { name: "导出 JSON", exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("每页订单数").fill("20");
  await dialog.getByLabel("开始日期").fill("2026-10-17");
  await dialog.getByLabel("结束日期").fill("2026-10-17");
  fixture.holdDetails = true;
  fixture.allowDetails = 1;
  await dialog.getByRole("button", { name: "重新收集", exact: true }).click();
  await expect.poll(() => fixture.requests.length).toBe(previousRequests + 3);
  await expect(
    dialog.getByRole("button", { name: "导出 JSON", exact: true }),
  ).toBeHidden();
  await expect(
    dialog.getByRole("button", { name: "停止并关闭", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "停止并保留结果", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "导出部分 JSON", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("结果日期：2026-10-17 至 2026-10-17", { exact: true }),
  ).toBeVisible();
  expect(downloads).toHaveLength(0);
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "导出部分 JSON", exact: true })
    .click();
  const exportedFile = await file(await download);
  expect(exportedFile.name).toBe(
    "拼多多账单_2026-10-17至2026-10-17_不完整.json",
  );
  const exported = JSON.parse(exportedFile.bytes.toString());
  expect(Array.isArray(exported)).toBe(true);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath("small-result.png") });
});

test("closing cancels a blocked detail and reopening retains already yielded orders", async ({
  shop,
}) => {
  const { page, dialog, fixture, downloads, file, release } = shop;
  fixture.holdDetails = true;
  fixture.allowDetails = 1;
  await dialog.getByRole("button", { name: "开始收集" }).click();
  await expect.poll(() => fixture.requests.length).toBe(3);
  await dialog.getByRole("button", { name: "停止并关闭", exact: true }).click();
  await page.getByRole("button", { name: "导出账单", exact: true }).click();
  const exportJson = dialog.getByRole("button", {
    name: "导出部分 JSON",
  });
  await expect(exportJson).toBeEnabled();
  release();
  expect(downloads).toHaveLength(0);
  const partialDownload = page.waitForEvent("download");
  await exportJson.click();
  const exported = await file(await partialDownload);
  expect(exported.name).toMatch(/_不完整\.json$/);
  const json = JSON.parse(exported.bytes.toString());
  expect(Array.isArray(json)).toBe(true);
  expect(json.map((entry: { order: unknown }) => entry.order)).toEqual(
    fixture.orders.slice(0, 1),
  );
  expect(
    json.every((entry: { detail: unknown }) => entry.detail !== null),
  ).toBe(true);
  await expect(dialog.getByLabel("开始日期")).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("export.png") });
  await dialog.getByText("收集设置", { exact: true }).click();
  await expect(dialog.getByLabel("开始日期")).toBeVisible();
  expect(fixture.requests).toHaveLength(3);
});

test("Escape stops collection while the same settings draft survives reopening", async ({
  shop,
}) => {
  const { page, dialog, fixture } = shop;
  fixture.holdDetails = true;
  fixture.allowDetails = 1;
  fixture.pageSize = 30;
  await dialog.getByText("请求设置", { exact: true }).click();
  await dialog.getByLabel("每页订单数").fill("30");
  await dialog.getByRole("button", { name: "开始收集" }).click();
  await expect.poll(() => fixture.requests.length).toBe(3);
  await expect(dialog.getByLabel("开始日期")).toBeHidden();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "停止并保留结果" }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("collecting.png") });
  await expect(dialog.getByLabel("每页订单数")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "导出账单", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "导出部分 JSON" }),
  ).toBeEnabled();
  await dialog.getByText("收集设置", { exact: true }).click();
  await expect(dialog.getByLabel("每页订单数")).toHaveValue("30");
  await expect(dialog.getByLabel("开始日期")).toBeEnabled();
  expect(fixture.requests).toHaveLength(3);
});

test("Native fields validate and remain isolated from site styles", async ({
  shop,
}) => {
  const { page, dialog, fixture } = shop;
  const before = await page.evaluate(() => ({
    styles: document.head.querySelectorAll("style").length,
    font: getComputedStyle(document.documentElement).fontSize,
  }));
  await page.addStyleTag({
    content:
      "input, button { font-size: 70px !important; display: none !important; }",
  });
  await expect(dialog.getByRole("button", { name: "开始收集" })).toBeVisible();
  expect(
    await dialog
      .getByLabel("开始日期")
      .evaluate((input) => getComputedStyle(input).fontSize),
  ).not.toBe("70px");
  await dialog.getByText("请求设置", { exact: true }).click();
  const size = dialog.getByLabel("每页订单数");
  await size.fill("0");
  await dialog.getByRole("button", { name: "开始收集" }).click();
  expect(
    await size.evaluate((input) => (input as HTMLInputElement).checkValidity()),
  ).toBe(false);
  expect(fixture.requests).toHaveLength(0);
  await size.fill("20");
  await dialog.getByLabel("开始日期").fill("2026-10-18");
  await dialog.getByLabel("结束日期").fill("2026-10-17");
  await dialog.getByRole("button", { name: "开始收集" }).click();
  expect(fixture.requests).toHaveLength(0);
  await dialog.getByLabel("开始日期").fill("");
  await dialog.getByLabel("结束日期").fill("");
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  await dialog.getByText("收集详情", { exact: true }).click();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByLabel("每页订单数").press("Enter");
  await expect(
    dialog.getByRole("button", { name: "导出 JSON", exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "重新收集", exact: true }),
  ).toBeFocused();
  expect(
    fixture.requests.every((request) => request.path.includes("order_list")),
  ).toBe(true);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出账单", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => ({
      styles: document.head.querySelectorAll("style").length,
      font: getComputedStyle(document.documentElement).fontSize,
    })),
  ).toEqual({ ...before, styles: before.styles + 1 });
});

test("CSV failure explains the JSON fallback and keeps the collected data", async ({
  shop,
}) => {
  const { page, dialog, fixture, downloads, file } = shop;
  fixture.orders[0]!.order_amount = -1;
  await dialog.getByRole("button", { name: "开始收集" }).click();
  const csv = dialog.getByRole("button", { name: "导出 CSV", exact: true });
  await expect(csv).toBeEnabled();
  const warning = page.waitForEvent("dialog");
  const clicked = csv.click();
  const alert = await warning;
  expect(alert.type()).toBe("alert");
  expect(alert.message()).toBe("CSV 生成失败，请尝试导出 JSON。");
  await alert.accept();
  await clicked;
  expect(downloads).toHaveLength(0);
  const json = dialog.getByRole("button", { name: "导出 JSON", exact: true });
  await expect(json).toBeEnabled();
  const download = page.waitForEvent("download");
  await json.click();
  const exported = JSON.parse((await file(await download)).bytes.toString());
  expect(exported.map((entry: { order: unknown }) => entry.order)).toEqual(
    fixture.orders,
  );
  await expect(dialog.getByRole("status")).toHaveText("收集完成。");
});

test("denied detail access shows a login hint without partial exports", async ({
  shop,
}) => {
  const { page, dialog, downloads } = shop;
  await page.route("**/order.html?*", (route) =>
    route.fulfill({
      status: 403,
      body: "Internal response details must not appear in the UI",
    }),
  );
  await dialog.getByRole("button", { name: "开始收集" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "登录已失效或访问被拒绝，请在当前页面重新登录。",
  );
  await expect(
    dialog.getByRole("button", { name: "开始收集", exact: true }),
  ).toBeEnabled();
  await expect(dialog).not.toContainText("Internal response details");
  expect(downloads).toHaveLength(0);
  await expect(dialog.getByRole("button", { name: /JSON/ })).toHaveCount(0);
});
