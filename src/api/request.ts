/* global AbortController, AbortSignal */

export interface RequestTimeout {
  signal: AbortSignal;
  clear: () => void;
}

export const createRequestTimeout = (timeoutMs: number): RequestTimeout => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
};

export const isAbortError = (err: unknown) => err instanceof Error && err.name === 'AbortError';
