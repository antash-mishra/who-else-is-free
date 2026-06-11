/* global fetch, RequestInfo, RequestInit, Response, URL */

import { API_BASE_URL } from './config';
import { ApiError, extractServerErrorMessage } from './errors';
import { createRequestTimeout } from './request';

export const DEFAULT_TIMEOUT_MS = 10_000;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RequestJsonOptions extends Omit<RequestInit, 'headers' | 'signal'> {
  /** Bearer token injected as an `Authorization` header when provided. */
  token?: string | null;
  /**
   * Milliseconds before the request aborts. Defaults to `DEFAULT_TIMEOUT_MS`.
   * Pass `null` to disable the timeout (matches call sites that never had one).
   */
  timeoutMs?: number | null;
  /** Custom fetch implementation, e.g. `authFetch` to keep 401-retry semantics. */
  fetchImpl?: FetchLike;
  /**
   * Error message used on non-OK responses instead of reading the body.
   * A function receives the response status. When omitted, the server `error`
   * field is extracted with a generic status-message fallback.
   */
  errorMessage?: string | ((status: number) => string);
  headers?: Record<string, string>;
}

/**
 * JSON request helper for the app API. Prefixes `API_BASE_URL`, injects the
 * Authorization header, applies an abortable timeout, parses JSON with a
 * tolerant fallback, and throws a typed `ApiError` on non-OK responses.
 */
export const requestJson = async <T = unknown>(
  path: string,
  options: RequestJsonOptions = {},
): Promise<T> => {
  const {
    token,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl,
    errorMessage,
    headers,
    ...init
  } = options;
  const fetchClient = fetchImpl ?? fetch;
  const timeout = timeoutMs == null ? null : createRequestTimeout(timeoutMs);

  try {
    const response = await fetchClient(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(timeout ? { signal: timeout.signal } : {}),
    });

    if (!response.ok) {
      const message =
        typeof errorMessage === 'function'
          ? errorMessage(response.status)
          : (errorMessage ?? (await extractServerErrorMessage(response)));
      throw new ApiError(message, response.status);
    }

    try {
      return (await response.json()) as T;
    } catch {
      // Tolerate empty or non-JSON success bodies (e.g. DELETE endpoints).
      return undefined as T;
    }
  } finally {
    timeout?.clear();
  }
};

export { ApiError, extractServerErrorMessage } from './errors';
export { isAbortError } from './request';
