import { expect, test } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { downloadedFile, expectFixtureErrors, openShop } from './shop';
import { detail, orders, uid } from './shop-data';

test('exports complete CSV and lossless JSON through the built userscript', async () => {
  const dialog = await openShop();
  await dialog.getByRole('button', { name: '开始导出' }).click();
  const csv = await downloadedFile();
  expect(csv.name).toMatch(/\.csv$/);
  expect(csv.name).not.toContain(uid);
  expect(csv.name).not.toContain('不完整');
  expect(csv.bytes.slice(0, 3)).toEqual([239, 187, 191]);
  expect(csv.text.split('\r\n')).toHaveLength(3);
  expect(csv.text).toContain(orders[0]!.order_sn);
  expect(csv.text).toContain('"1.99"');
  await expect
    .element(dialog.getByText('1 笔 · 订单金额合计 ￥1.99'))
    .toBeVisible();
  await expect
    .element(dialog.getByRole('group', { name: '导出结果' }))
    .toBeVisible();

  await dialog.getByRole('button', { name: '下载 JSON' }).click();
  const file = await downloadedFile(1);
  expect(file.text).toContain('"synthetic_number": 9007199254740993');
  expect(file.text).not.toContain('"rawJSON"');
  const json = JSON.parse(file.text);
  expect(json).toMatchObject({
    schemaVersion: 1,
    complete: true,
    reason: 'end',
  });
  expect(json.entries).toEqual(
    JSON.parse(JSON.stringify(orders)).map(
      (order: Record<string, unknown>) => ({
        order,
        detail,
        detailStatus: 'ok',
      }),
    ),
  );
  expect(json.progress).toEqual({
    pages: 2,
    scanned: 1,
    selected: 1,
    duplicates: 0,
    unknownDates: 0,
    detailFailures: 0,
  });
  const state = await commands.shopState();
  expect(state.requests.map((request) => request.method)).toEqual([
    'POST',
    'GET',
    'POST',
  ]);
  expect(state.downloads).toBe(2);
});

test('native fetch cancellation enables explicit partial download', async () => {
  const dialog = await openShop('cancel');
  await dialog.getByRole('button', { name: '开始导出' }).click();
  await expect
    .poll(async () => (await commands.shopState()).requests.length)
    .toBe(2);
  await expect
    .element(page.getByRole('progressbar'))
    .toHaveAttribute('max', '1');
  await expect.element(page.getByLabelText('开始日期')).toBeDisabled();
  await dialog.getByRole('button', { name: '停止并保留结果' }).click();
  await expect
    .element(dialog.getByRole('button', { name: '下载部分 JSON（不完整）' }))
    .toBeEnabled();
  expect((await commands.shopState()).downloads).toBe(0);
  await commands.releaseShopDetail();
  await dialog.getByRole('button', { name: '下载部分 JSON（不完整）' }).click();
  const file = await downloadedFile();
  expect(file.name).toMatch(/_不完整\.json$/);
  const json = JSON.parse(file.text);
  expect(file.text).toContain('"synthetic_number": 9007199254740993');
  expect(json).toMatchObject({ complete: false, reason: 'cancelled' });
  expect(json.entries).toEqual(
    JSON.parse(JSON.stringify(orders)).map(
      (order: Record<string, unknown>) => ({
        order,
        detail: null,
        detailStatus: 'skipped',
      }),
    ),
  );
});

test('rejects unexpected requests from child frames', async () => {
  await openShop();
  const expected =
    'Error: Unexpected application request: GET /__unexpected_child_request';
  expectFixtureErrors([expected]);
  const child = document.createElement('iframe');
  child.dataset.shopFixture = '';
  child.src = '/__unexpected_child_request';
  document.body.append(child);
  await expect
    .poll(async () => (await commands.shopState()).errors)
    .toEqual([expected]);
});

test('native dialog, form validation and Shadow DOM work at a narrow viewport', async () => {
  const dialog = await openShop();
  const start = page
    .getByLabelText('开始日期')
    .element()
    .getBoundingClientRect();
  const end = page.getByLabelText('结束日期').element().getBoundingClientRect();
  expect(start.y).toBe(end.y);
  await page.viewport(390, 844);
  const element = dialog.element();
  expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
  expect(
    getComputedStyle(page.getByLabelText('开始日期').element()).fontSize,
  ).toBe('16px');
  await page.getByText('高级选项').click();
  await page.getByLabelText('每页订单数').fill('0');
  await dialog.getByRole('button', { name: '开始导出' }).click();
  expect(
    (page.getByLabelText('每页订单数').element() as HTMLInputElement).validity
      .rangeUnderflow,
  ).toBe(true);
  expect((await commands.shopState()).requests).toEqual([]);
  await userEvent.keyboard('{Escape}');
  await expect.element(dialog).not.toBeVisible();
});
