import { afterEach, expect, it, vi } from 'vitest';
import { createHttpClient } from '../src/api/http';
import { delay } from '../src/core/errors';

afterEach(() => vi.useRealTimers());
const signal = () => new AbortController().signal;

it('retries transient failures only and includes the current session', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response('synthetic'));
  const request = createHttpClient({ fetch: fetcher });
  const pending = request(
    '/synthetic',
    { method: 'POST', body: '{}' },
    signal(),
  );
  await vi.runAllTimersAsync();
  expect(await pending).toBe('synthetic');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenCalledWith(
    '/synthetic',
    expect.objectContaining({
      credentials: 'include',
      redirect: 'error',
      body: '{}',
    }),
  );
  expect(vi.getTimerCount()).toBe(0);
});

it.each([400, 401, 403, 404])('does not retry HTTP %i', async (status) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status }));
  await expect(
    createHttpClient({ fetch: fetcher })('/synthetic', {}, signal()),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([401, 403])(
  'does not let unread-body cleanup mask HTTP %i',
  async (status) => {
    let requestSignal: AbortSignal | null | undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        requestSignal = init?.signal;
        return new Response(
          new ReadableStream({
            cancel() {
              throw new Error('synthetic stream cleanup failure');
            },
          }),
          { status },
        );
      });
    await expect(
      createHttpClient({ fetch: fetcher })('/synthetic', {}, signal()),
    ).rejects.toMatchObject({ code: 'session' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(true);
  },
);

it('honors Retry-After and rejects excessive waits instead of retrying too early', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'retry-after': '2' } }),
    )
    .mockResolvedValueOnce(new Response('ok'));
  const pending = createHttpClient({ fetch: fetcher })(
    '/synthetic',
    {},
    signal(),
  );
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe('ok');
  fetcher
    .mockReset()
    .mockResolvedValue(
      new Response(null, { status: 429, headers: { 'retry-after': '60' } }),
    );
  await expect(
    createHttpClient({ fetch: fetcher })('/synthetic', {}, signal()),
  ).rejects.toThrow('稍后');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('stops after the retry budget without a final backoff', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new TypeError('synthetic network error'));
  const startedAt = Date.now();
  const assertion = expect(
    createHttpClient({ fetch: fetcher })('/synthetic', {}, signal()),
  ).rejects.toThrow('多次失败');
  await vi.runAllTimersAsync();
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(Date.now() - startedAt).toBe(3000);
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels immediately during backoff and releases its timers', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new TypeError('network'));
  const assertion = expect(
    createHttpClient({ fetch: fetcher })('/synthetic', {}, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(() => delay(1000, controller.signal)).toThrow();
});

it('bounds each attempt with a timeout and propagates aborts to fetch', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('', 'AbortError')),
          { once: true },
        );
      }),
  );
  const assertion = expect(
    createHttpClient({ fetch: fetcher, attempts: 1, timeoutMs: 100 })(
      '/synthetic',
      {},
      signal(),
    ),
  ).rejects.toThrow('超时');
  await vi.advanceTimersByTimeAsync(100);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

it('shares a timeout between headers and body instead of resetting it after headers', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              ok: true,
              text: () =>
                new Promise((_resolve, reject) => {
                  init!.signal!.addEventListener(
                    'abort',
                    () => reject(new DOMException('', 'AbortError')),
                    { once: true },
                  );
                }),
            } as Response),
          60,
        );
      }),
  );
  const assertion = expect(
    createHttpClient({ fetch: fetcher, attempts: 1, timeoutMs: 100 })(
      '/synthetic',
      {},
      signal(),
    ),
  ).rejects.toThrow('超时');
  await vi.advanceTimersByTimeAsync(99);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
