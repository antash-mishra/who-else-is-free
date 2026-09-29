/* global AbortController, AbortSignal */

export interface RequestTimeout {
  signal: AbortSignal;
  clear: () => void;
}

export const createRequestTimeout = (timeoutMs: number, signal?: AbortSignal): RequestTimeout => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort);
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abort);
    },
  };
};

export const isAbortError = (err: unknown) => err instanceof Error && err.name === 'AbortError';
