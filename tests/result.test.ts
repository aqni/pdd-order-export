// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { result } from './fixtures';
import { resultTag, type ExportResultElement } from '../src/ui/result';
vi.mock('../src/ui/styles.css?style', () => ({
  default: document.createElement('style'),
}));
vi.mock('../src/ui/result.css?style', () => ({
  default: document.createElement('style'),
}));
afterEach(() => document.body.replaceChildren());
it('keeps partial warnings visible and emits format intents', () => {
  const component = document.createElement(resultTag) as ExportResultElement;
  const partial = result();
  partial.complete = false;
  partial.reason = 'limit';
  component.state = {
    running: false,
    result: partial,
    progress: partial.progress,
    error: '',
    status: '结果不完整。页数上限',
  };
  document.body.append(component);
  const root = component.shadowRoot!;
  const status = root.querySelector<HTMLElement>('.status')!;
  expect(status.hidden).toBe(false);
  expect(status.classList.contains('warning')).toBe(true);
  expect(status.closest('details')).toBeNull();
  const formats: string[] = [];
  component.addEventListener('export-download', (event) => {
    formats.push((event as CustomEvent<string>).detail);
  });
  for (const format of ['csv', 'json']) {
    const button = root.querySelector<HTMLButtonElement>(`.${format}`)!;
    expect(button.textContent).toContain(
      `下载部分 ${format.toUpperCase()}（不完整）`,
    );
    button.click();
  }
  expect(formats).toEqual(['csv', 'json']);
});

it('renders errors as text without constructing dynamic HTML', () => {
  const component = document.createElement(resultTag) as ExportResultElement;
  component.state = {
    running: false,
    result: null,
    progress: null,
    error: '<img src=x onerror=evil()>',
    status: '失败',
  };
  document.body.append(component);
  expect(component.shadowRoot!.querySelector('.error')!.textContent).toContain(
    '<img',
  );
  expect(component.shadowRoot!.querySelector('img')).toBeNull();
});

it('groups feedback in a native fieldset and identifies the result date range', () => {
  const component = document.createElement(resultTag) as ExportResultElement;
  const output = result();
  output.options.startDate = '2026-10-01';
  output.options.endDate = '2026-10-18';
  component.state = {
    running: false,
    result: output,
    progress: output.progress,
    error: '',
    status: '读取完成',
  };
  document.body.append(component);
  const group = component.shadowRoot!.querySelector('fieldset')!;
  expect(group.querySelector('legend')!.textContent).toBe('导出结果');
  expect(group.hidden).toBe(false);
  expect(group.querySelector('.range')!.textContent).toContain(
    '2026-10-01 至 2026-10-18',
  );
  component.state = { ...component.state!, result: null, progress: null };
  expect(group.hidden).toBe(true);
});

it('shows the empty-result message without a misleading zero amount or download controls', () => {
  const component = document.createElement(resultTag) as ExportResultElement;
  const output = result();
  output.entries = [];
  component.state = {
    running: false,
    result: output,
    progress: output.progress,
    error: '',
    status: '没有找到订单',
  };
  document.body.append(component);
  const root = component.shadowRoot!;
  expect(root.querySelector<HTMLElement>('.status')!.hidden).toBe(false);
  expect(root.querySelector<HTMLElement>('.totals')!.hidden).toBe(true);
  expect(root.querySelector<HTMLElement>('.downloads')!.hidden).toBe(true);
  expect(root.querySelector('details')!.hidden).toBe(true);
});
it('the result works independently and emits download intent without owning a task', () => {
  const component = document.createElement(resultTag) as ExportResultElement;
  component.state = {
    running: false,
    result: result(),
    progress: null,
    error: '',
    status: '合成结果',
  };
  const formats: string[] = [];
  component.addEventListener('export-download', (event) => {
    formats.push((event as CustomEvent<string>).detail);
  });
  document.body.append(component);
  expect(component.shadowRoot!.querySelector('.totals')!.textContent).toContain(
    '1 笔 · 订单金额合计',
  );
  expect(
    component.shadowRoot!.querySelector('.amount-note')!.textContent,
  ).toContain('1 笔金额缺失或异常，未计入合计。');
  expect(component.shadowRoot!.querySelector('details')!.open).toBe(false);
  expect(
    component.shadowRoot!.querySelector<HTMLElement>('.amount-note')!.hidden,
  ).toBe(false);
  component.shadowRoot!.querySelector<HTMLButtonElement>('.csv')!.click();
  expect(formats).toEqual(['csv']);
  expect(document.querySelector('pdd-export-form')).toBeNull();
});
it('shows an unavailable total on overflow while leaving downloads available', () => {
  const component = document.createElement(resultTag) as ExportResultElement;
  const output = result();
  output.entries = [Number.MAX_SAFE_INTEGER, 1].map((amount) => ({
    ...output.entries[0]!,
    order: { order_amount: amount },
  }));
  component.state = {
    running: false,
    result: output,
    progress: null,
    error: '',
    status: '读取完成',
  };
  document.body.append(component);
  const root = component.shadowRoot!;
  expect(root.querySelector('.totals')!.textContent).toBe(
    '2 笔 · 订单金额合计超出安全计算范围',
  );
  expect(root.querySelector<HTMLButtonElement>('.csv')!.disabled).toBe(false);
});

it('shows determinate progress only for the current page of details', () => {
  const component = document.createElement(resultTag) as ExportResultElement;
  document.body.append(component);
  const state = {
    running: true,
    result: null,
    progress: {
      ...result().progress,
      current: { kind: 'details' as const, page: 2, completed: 3, total: 10 },
    },
    error: '',
    status: '正在读取',
  };
  component.state = state;
  const root = component.shadowRoot!;
  const activity = root.querySelector('progress')!;
  expect(activity.max).toBe(10);
  expect(activity.value).toBe(3);
  expect(root.querySelector<HTMLElement>('.counts')!.hidden).toBe(false);
  expect(root.querySelector('details')!.hidden).toBe(true);
  expect(root.querySelector('.status')!.textContent).toContain(
    '第 2 页详情：已处理 3/10',
  );
  component.state = {
    ...state,
    progress: { ...result().progress, current: { kind: 'list', page: 3 } },
  };
  expect(activity.hasAttribute('value')).toBe(false);
  expect(root.querySelector('.status')!.textContent).toContain(
    '第 3 页列表，总页数未知',
  );
  component.state = { ...state, running: false, result: result() };
  expect(activity.hidden).toBe(true);
  expect(root.querySelector<HTMLElement>('.counts')!.hidden).toBe(true);
  expect(root.querySelector('details')!.hidden).toBe(false);
  expect(root.querySelector('details')!.open).toBe(false);
  expect(root.querySelector('.statistics')!.textContent).toContain('已读 2 页');
  expect(root.querySelector('.statistics')!.closest('details')).not.toBeNull();
});
