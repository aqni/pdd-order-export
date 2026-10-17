import { checkCancelled, delay, ExportError } from '../core/errors';

interface HttpOptions {
  fetch: typeof fetch;
  attempts: number;
  timeoutMs: number;
  baseDelayMs: number;
}

function retryDelay(response: Response, fallback: number): number {
  const header = response.headers.get('retry-after');
  if (!header) {
    return fallback;
  }
  const seconds = Number(header);
  const wait = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - Date.now();
  if (wait > 30_000) {
    throw new ExportError('服务端要求稍后再试，已停止读取以避免继续请求。');
  }
  return Number.isFinite(wait) ? Math.max(fallback, wait) : fallback;
}

/** One timeout covers fetch and body consumption; retries never outlive cancellation. */
export function createHttpClient(overrides: Partial<HttpOptions> = {}) {
  const config = {
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
    attempts: 3,
    timeoutMs: 20_000,
    baseDelayMs: 1000,
    ...overrides,
  };
  return async (
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<string> => {
    for (let attempt = 0; attempt < config.attempts; attempt++) {
      checkCancelled(signal);
      const scope = new AbortController();
      const abort = () => scope.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, config.timeoutMs);
      let wait = config.baseDelayMs * 2 ** attempt;
      try {
        const response = await config.fetch(url, {
          ...init,
          credentials: 'include',
          redirect: 'error',
          signal: scope.signal,
        });
        checkCancelled(signal);
        if (response.ok) {
          const body = await response.text();
          checkCancelled(signal);
          checkCancelled(scope.signal);
          return body;
        }
        // Stop the unread body without letting stream cleanup mask the HTTP status.
        scope.abort();
        if (response.status === 401 || response.status === 403) {
          throw new ExportError(
            '登录已失效或访问被拒绝，请在当前页面重新登录。',
            'session',
          );
        }
        if (
          response.status !== 408 &&
          response.status !== 429 &&
          response.status < 500
        ) {
          throw new ExportError(
            `请求被拒绝（HTTP ${response.status}），请检查当前页面。`,
          );
        }
        wait = retryDelay(response, wait);
      } catch (error) {
        checkCancelled(signal);
        if (error instanceof ExportError) {
          throw error;
        }
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      }
      if (attempt + 1 < config.attempts) {
        await delay(Math.min(30_000, Math.max(0, wait)), signal);
      }
    }
    throw new ExportError('请求多次失败或超时，已停止读取。');
  };
}
