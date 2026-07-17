/* global RequestInfo, RequestInit, Response, URL */

import { requestJson } from '@api/client';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type HelpSubmissionType = 'contact' | 'feedback';
export type HelpSubmissionStatus = 'new' | 'reviewed' | 'closed';

interface ApiAdminHelpSubmitter {
  id: number;
  name: string;
  email: string;
}

interface ApiAdminHelpSubmission {
  id: number;
  submission_type: HelpSubmissionType;
  message?: string;
  message_preview?: string;
  urgent_safety_issue: boolean;
  wants_reply: boolean;
  reply_email?: string;
  status: HelpSubmissionStatus;
  created_at: string;
  submitter?: ApiAdminHelpSubmitter;
}

interface ApiAdminHelpListResponse {
  submissions: ApiAdminHelpSubmission[];
  next_cursor: string | null;
}

interface ApiAdminHelpDetailResponse {
  submission: ApiAdminHelpSubmission;
}

export interface AdminHelpSubmitter {
  id: number;
  name: string;
  email: string;
}

export interface AdminHelpSubmission {
  id: number;
  type: HelpSubmissionType;
  message: string;
  urgentSafetyIssue: boolean;
  wantsReply: boolean;
  replyEmail?: string;
  status: HelpSubmissionStatus;
  createdAt: string;
  submitter?: AdminHelpSubmitter;
}

export interface AdminHelpFilters {
  type: 'all' | HelpSubmissionType;
  status: 'all' | HelpSubmissionStatus;
}

export interface AdminHelpPage {
  submissions: AdminHelpSubmission[];
  nextCursor: string | null;
}

export interface CreateHelpSubmissionInput {
  type: HelpSubmissionType;
  message: string;
  urgentSafetyIssue?: boolean;
  wantsReply?: boolean;
  replyEmail?: string;
}

export const MAX_HELP_MESSAGE_LENGTH = 4000;
export const MAX_REPLY_EMAIL_LENGTH = 254;

const mapAdminHelpSubmission = (item: ApiAdminHelpSubmission): AdminHelpSubmission => ({
  id: item.id,
  type: item.submission_type,
  message: item.message ?? item.message_preview ?? '',
  urgentSafetyIssue: item.urgent_safety_issue,
  wantsReply: item.wants_reply,
  replyEmail: item.reply_email,
  status: item.status,
  createdAt: item.created_at,
  submitter: item.submitter,
});

export const getAdminAccess = async (fetchImpl: FetchLike): Promise<boolean> => {
  const payload = await requestJson<{ is_admin: boolean }>('/api/admin-access', {
    fetchImpl,
    errorMessage: () => 'Unable to check admin access',
  });
  return payload.is_admin;
};

export const listAdminHelpSubmissions = async (
  fetchImpl: FetchLike,
  filters: AdminHelpFilters,
  cursor?: string | null,
): Promise<AdminHelpPage> => {
  const query: string[] = ['limit=25'];
  if (filters.type !== 'all') query.push(`type=${encodeURIComponent(filters.type)}`);
  if (filters.status !== 'all') query.push(`status=${encodeURIComponent(filters.status)}`);
  if (cursor) query.push(`cursor=${encodeURIComponent(cursor)}`);

  const payload = await requestJson<ApiAdminHelpListResponse>(
    `/api/admin/help-submissions?${query.join('&')}`,
    {
      fetchImpl,
      errorMessage: (status) =>
        status === 403 ? 'Admin access is no longer available' : 'Unable to load support messages',
    },
  );
  return {
    submissions: payload.submissions.map(mapAdminHelpSubmission),
    nextCursor: payload.next_cursor,
  };
};

export const getAdminHelpSubmission = async (
  fetchImpl: FetchLike,
  id: number,
): Promise<AdminHelpSubmission> => {
  const payload = await requestJson<ApiAdminHelpDetailResponse>(
    `/api/admin/help-submissions/${id}`,
    {
      fetchImpl,
      errorMessage: (status) =>
        status === 403 ? 'Admin access is no longer available' : 'Unable to load this message',
    },
  );
  return mapAdminHelpSubmission(payload.submission);
};

export const updateAdminHelpSubmissionStatus = async (
  fetchImpl: FetchLike,
  id: number,
  status: HelpSubmissionStatus,
): Promise<AdminHelpSubmission> => {
  const payload = await requestJson<ApiAdminHelpDetailResponse>(
    `/api/admin/help-submissions/${id}/status`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
      fetchImpl,
      errorMessage: (responseStatus) =>
        responseStatus === 403
          ? 'Admin access is no longer available'
          : 'Unable to update this message',
    },
  );
  return mapAdminHelpSubmission(payload.submission);
};

export const submitHelpSubmission = async (
  fetchImpl: FetchLike,
  input: CreateHelpSubmissionInput,
): Promise<void> => {
  await requestJson('/api/help-submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: input.type,
      message: input.message,
      urgent_safety_issue: input.urgentSafetyIssue,
      wants_reply: input.wantsReply,
      reply_email: input.replyEmail,
    }),
    fetchImpl,
    errorMessage: (status) =>
      status === 401
        ? 'Session expired. Please sign in again.'
        : status === 429
          ? 'Too many messages were sent. Please try again later.'
          : 'Unable to submit right now. Please try again.',
  });
};
