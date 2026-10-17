// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountPanel } from '../src/ui/panel';
import type { ExportResult, OrderSource } from '../src/core/types';
import { result } from './fixtures';

vi.mock('../src/ui/styles.css?style', () => ({
  default: document.createElement('style'),
}));
vi.mock('../src/ui/panel.css?style', () => ({
  default: document.createElement('style'),
}));
vi.mock('../src/ui/form.css?style', () => ({
  default: document.createElement('style'),
}));
vi.mock('../src/ui/result.css?style', () => ({
  default: document.createElement('style'),
}));
let dispose: (() => void) | undefined;
const api: OrderSource = { list: vi.fn(), details: vi.fn() };
const root = () => document.querySelector('#pdd-order-export')!.shadowRoot!;
const formRoot = () => root().querySelector('pdd-export-form')!.shadowRoot!;
const resultRoot = () => root().querySelector('pdd-export-result')!.shadowRoot!;
const get = <T extends Element>(selector: string): T => {
  for (const scope of [root(), formRoot(), resultRoot()]) {
    const element = scope.querySelector<T>(selector);
    if (element) return element;
  }
  throw new Error('Missing test element: ' + selector);
};
const submit = () =>
  get('form').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  );

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

it('opens and closes an isolated dialog and prevents duplicate panels', () => {
  dispose = mountPanel();
  mountPanel();
  expect(document.querySelectorAll('#pdd-order-export')).toHaveLength(1);
  get<HTMLButtonElement>('.launcher').click();
  expect(get<HTMLDialogElement>('dialog').open).toBe(true);
  expect(get<HTMLElement>('.result').hidden).toBe(true);
  expect(get<HTMLButtonElement>('.cancel').hidden).toBe(true);
  get<HTMLButtonElement>('.close').click();
  expect(get<HTMLDialogElement>('dialog').open).toBe(false);
});

it('connects form submission and result download events to the session', async () => {
  const download = vi.fn();
  const collect = vi.fn().mockResolvedValue(result());
  dispose = mountPanel({ source: () => api, collect, download });
  get<HTMLInputElement>('[name="format"][value="json"]').click();
  submit();
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  expect(download.mock.calls[0]?.[0].name).toMatch(/\.json$/);
  expect(get('.status').textContent).toContain('已发起 JSON');
  get<HTMLButtonElement>('.csv').click();
  expect(download.mock.calls[1]?.[0].name).toMatch(/\.csv$/);
});

it('aborts an active task when the native custom element is removed externally', async () => {
  let activeSignal: AbortSignal | undefined;
  const collect = vi.fn((_api, _options, signal: AbortSignal) => {
    activeSignal = signal;
    return new Promise<ExportResult>((resolve) => {
      signal.addEventListener('abort', () =>
        resolve({ ...result(), complete: false, reason: 'cancelled' }),
      );
    });
  });
  dispose = mountPanel({ source: () => api, collect, download: vi.fn() });
  submit();
  const host = document.querySelector('#pdd-order-export')!;
  expect(host.localName).toBe('pdd-order-export-panel');
  host.remove();
  expect(activeSignal?.aborted).toBe(true);
  await vi.waitFor(() => expect(collect).toHaveResolved());
  expect(host.shadowRoot?.childElementCount).toBe(0);
  document.body.append(host);
  expect(formRoot().querySelectorAll('form')).toHaveLength(1);
  get<HTMLButtonElement>('.launcher').click();
  expect(get<HTMLDialogElement>('dialog').open).toBe(true);
  dispose();
  dispose = mountPanel();
  get<HTMLButtonElement>('.launcher').click();
  expect(get<HTMLDialogElement>('dialog').open).toBe(true);
});

it('closing the dialog keeps the active task and its eventual result available', async () => {
  let finish!: (value: ExportResult) => void;
  let signal!: AbortSignal;
  const download = vi.fn();
  const collect = vi.fn((_api, _options, activeSignal: AbortSignal) => {
    signal = activeSignal;
    return new Promise<ExportResult>((resolve) => {
      finish = resolve;
    });
  });
  dispose = mountPanel({ source: () => api, collect, download });
  get<HTMLButtonElement>('.launcher').click();
  submit();
  get<HTMLButtonElement>('.close').click();
  expect(signal.aborted).toBe(false);
  finish(result());
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  get<HTMLButtonElement>('.launcher').click();
  expect(get<HTMLDialogElement>('dialog').open).toBe(true);
  expect(get('.totals').textContent).toContain('1 笔 · 订单金额合计');
});

it('a disconnected session cannot download or overwrite a reconnected panel with a late result', async () => {
  let finish!: (value: ExportResult) => void;
  const download = vi.fn();
  const collect = vi.fn(
    () =>
      new Promise<ExportResult>((resolve) => {
        finish = resolve;
      }),
  );
  dispose = mountPanel({ source: () => api, collect, download });
  submit();
  const host = document.querySelector('#pdd-order-export')!;
  host.remove();
  document.body.append(host);
  finish(result());
  await vi.waitFor(() => expect(collect).toHaveResolved());
  expect(download).not.toHaveBeenCalled();
  expect(get('.totals').hasAttribute('hidden')).toBe(true);
  expect(get('.status').textContent).toContain('设置好范围后开始导出');
  expect(get<HTMLElement>('.result').hidden).toBe(true);
});
