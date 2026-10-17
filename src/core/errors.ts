export class ExportError extends Error {
  constructor(
    message: string,
    readonly code: 'request' | 'session' | 'schema' | 'input' = 'request',
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof ExportError
    ? error.message
    : '操作失败，请稍后重试。';
}

export function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('操作已取消', 'AbortError');
  }
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  checkCancelled(signal);
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('操作已取消', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
