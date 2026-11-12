/* global fetch */

import type { SessionPayload } from '@context/authSession';

import { requestJson } from './client';
import { API_BASE_URL } from './config';
import { ApiError } from './errors';

export type EmailCodeErrorReason = 'code_invalid' | 'code_expired';

/** Asks the server to email a 6-digit sign-in code to `email`. */
export const requestEmailCode = async (email: string): Promise<void> => {
  await requestJson('/api/email-login/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
};

/**
 * Exchanges an emailed code for a session. A wrong or expired code throws an
 * `ApiError` whose `code` is an `EmailCodeErrorReason`.
 */
export const postEmailCode = async (email: string, code: string): Promise<SessionPayload> => {
  const response = await fetch(`${API_BASE_URL}/api/email-login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const body = (await response.json().catch(() => ({}))) as Partial<SessionPayload> & {
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new ApiError(body.error || 'Unable to sign in. Please try again.', response.status, {
      code: body.code,
    });
  }
  return body as SessionPayload;
};
