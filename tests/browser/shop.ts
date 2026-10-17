import { afterEach, expect } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import type { Scenario } from './shop-data';

let expectedErrors: string[] = [];

export function expectFixtureErrors(errors: string[]) {
  expectedErrors = errors;
}

afterEach(async () => {
  // Cancel component work before closing the network and download fixture.
  document.querySelector('#pdd-order-export')?.remove();
  document
    .querySelectorAll('[data-shop-fixture]')
    .forEach((node) => node.remove());
  try {
    expect((await commands.shopState()).errors).toEqual(expectedErrors);
  } finally {
    expectedErrors = [];
    await commands.stopShop();
    await page.viewport(1280, 720);
    await userEvent.cleanup();
  }
});

export async function openShop(scenario: Scenario = 'complete') {
  await commands.startShop(scenario);
  const outerStyle = document.createElement('style');
  outerStyle.dataset.shopFixture = '';
  outerStyle.textContent = 'button,input{font-size:30px;background:lime}';
  document.head.append(outerStyle);
  const script = document.createElement('script');
  script.dataset.shopFixture = '';
  script.src = '/__synthetic/userscript.js';
  await new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Could not load the built userscript'));
    document.body.append(script);
  });
  await page.getByRole('button', { name: '导出账单', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: '订单导出',
    includeHidden: true,
  });
  await expect.element(dialog).toBeVisible();
  await expect
    .poll(() => page.getByLabelText('开始日期').element().matches(':focus'))
    .toBe(true);
  await page.getByLabelText('开始日期').fill('');
  await page.getByLabelText('结束日期').fill('');
  return dialog;
}

export async function downloadedFile(index = 0) {
  await expect
    .poll(async () => (await commands.shopState()).downloads)
    .toBeGreaterThan(index);
  return commands.readShopDownload(index);
}
