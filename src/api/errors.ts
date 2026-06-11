/* global Response */

/**
 * Typed API error thrown by `requestJson` (and auth helpers) when the server
 * responds with a non-OK status.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;

  constructor(message: string, status: number, options?: { code?: string; data?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options?.code;
    this.data = options?.data;
  }
}

/**
 * Reads the JSON error body of a failed response and returns the server-provided
 * `error` message. Falls back to `fallbackMessage` (when given) and finally to a
 * generic status message, mirroring the repeated
 * `response.json().catch(() => ({}))` + `data.error` pattern.
 */
export const extractServerErrorMessage = async (
  response: Response,
  fallbackMessage?: string,
): Promise<string> => {
  let data: { error?: string } | undefined;
  try {
    data = (await response.json()) as { error?: string };
  } catch {
    data = undefined;
  }
  return data?.error || fallbackMessage || `Request failed with status ${response.status}`;
};
