// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { formTag, type ExportFormElement } from '../src/ui/form';
import type { ExportRequest } from '../src/ui/model';
vi.mock('../src/ui/styles.css?style', () => ({
  default: document.createElement('style'),
}));
vi.mock('../src/ui/form.css?style', () => ({
  default: document.createElement('style'),
}));
afterEach(() => document.body.replaceChildren());
it('initializes month dates and preserves drafts across busy state updates', () => {
  const component = document.createElement(formTag) as ExportFormElement;
  document.body.append(component);
  const root = component.shadowRoot!;
  const form = root.querySelector('form')!;
  const date = form.elements.namedItem('startDate') as HTMLInputElement;
  const today = new Date();
  expect(date.value).toBe(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
  );
  const advanced = root.querySelector('details')!;
  const size = form.elements.namedItem('pageSize') as HTMLInputElement;
  const maxPages = form.elements.namedItem('maxPages') as HTMLInputElement;
  const details = form.elements.namedItem('includeDetails') as HTMLInputElement;
  expect(details.closest('details')).toBeNull();
  expect(advanced.open).toBe(false);
  advanced.open = true;
  size.value = '20';
  maxPages.value = '5';
  date.value = '';
  (form.elements.namedItem('endDate') as HTMLInputElement).value = '';
  details.checked = false;
  component.running = true;
  component.running = false;
  expect(root.querySelector('form')).toBe(form);
  expect(advanced.open).toBe(true);
  expect(size.value).toBe('20');
  let request: ExportRequest | undefined;
  component.addEventListener('export-request', (event) => {
    request = (event as CustomEvent<ExportRequest>).detail;
  });
  form.requestSubmit();
  expect(request?.options).toEqual({
    startDate: '',
    endDate: '',
    pageSize: 20,
    maxPages: 5,
    includeDetails: false,
  });
});

it('uses a native minimum end date that follows the start date', () => {
  const component = document.createElement(formTag) as ExportFormElement;
  document.body.append(component);
  const form = component.shadowRoot!.querySelector('form')!;
  const start = form.elements.namedItem('startDate') as HTMLInputElement;
  const end = form.elements.namedItem('endDate') as HTMLInputElement;
  start.value = '2026-10-18';
  start.dispatchEvent(new Event('input', { bubbles: true }));
  end.value = '2026-10-17';
  expect(end.validity.rangeUnderflow).toBe(true);
  start.value = '';
  start.dispatchEvent(new Event('input', { bubbles: true }));
  expect(end.min).toBe('');
  expect(end.validity.valid).toBe(true);
});

it('emits cancellation intent only, without owning an export task', () => {
  const component = document.createElement(formTag) as ExportFormElement;
  document.body.append(component);
  const cancel = vi.fn();
  component.addEventListener('export-cancel', cancel);
  component.running = true;
  component.shadowRoot!.querySelector<HTMLButtonElement>('.cancel')!.click();
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('the form works independently through its running property and export-request event', () => {
  const component = document.createElement(formTag) as ExportFormElement;
  component.running = true;
  document.body.append(component);
  const shadow = component.shadowRoot!;
  const form = shadow.querySelector('form')!;
  const date = form.elements.namedItem('startDate') as HTMLInputElement;
  const formats = form.elements.namedItem('format') as RadioNodeList;
  const requests: ExportRequest[] = [];
  component.addEventListener('export-request', (event) => {
    requests.push((event as CustomEvent<ExportRequest>).detail);
  });
  expect(shadow.querySelector('fieldset')!.disabled).toBe(true);
  component.running = false;
  date.value = '2020-01-01';
  formats.value = 'json';
  component.running = true;
  component.running = false;
  expect(shadow.querySelector('form')).toBe(form);
  expect(date.value).toBe('2020-01-01');
  form.requestSubmit();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    options: { startDate: '2020-01-01', pageSize: 10 },
    format: 'json',
  });
});
