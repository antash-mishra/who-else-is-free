/* global Response */

import {
  getAdminAccess,
  getAdminHelpSubmission,
  listAdminHelpSubmissions,
  submitHelpSubmission,
  updateAdminHelpSubmissionStatus,
} from '@api/adminHelp';

jest.mock('@api/config', () => ({
  API_BASE_URL: 'http://localhost:8080',
  WS_BASE_URL: 'ws://localhost:8080',
  CHAT_ENABLED: true,
}));

const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('admin help API', () => {
  it('reads admin access', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ is_admin: true }));

    await expect(getAdminAccess(fetchImpl)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8080/api/admin-access',
      expect.any(Object),
    );
  });

  it('maps and filters a support inbox page', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      response({
        submissions: [
          {
            id: 4,
            submission_type: 'contact',
            message_preview: 'Please help',
            urgent_safety_issue: true,
            wants_reply: true,
            reply_email: 'person@example.com',
            status: 'new',
            created_at: '2026-07-17T10:00:00.000Z',
            submitter: { id: 2, name: 'Person', email: 'person@example.com' },
          },
        ],
        next_cursor: 'next',
      }),
    );

    const page = await listAdminHelpSubmissions(
      fetchImpl,
      { type: 'contact', status: 'new' },
      'cursor value',
    );

    expect(page.submissions[0]).toMatchObject({
      id: 4,
      type: 'contact',
      message: 'Please help',
      urgentSafetyIssue: true,
      replyEmail: 'person@example.com',
    });
    expect(page.nextCursor).toBe('next');
    expect(fetchImpl.mock.calls[0][0]).toContain(
      '/api/admin/help-submissions?limit=25&type=contact&status=new&cursor=cursor%20value',
    );
  });

  it('loads detail and updates status', async () => {
    const detailPayload = {
      submission: {
        id: 8,
        submission_type: 'feedback',
        message: 'Full feedback',
        urgent_safety_issue: false,
        wants_reply: false,
        status: 'reviewed',
        created_at: '2026-07-17T10:00:00.000Z',
      },
    };
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(detailPayload))
      .mockResolvedValueOnce(response(detailPayload));

    await expect(getAdminHelpSubmission(fetchImpl, 8)).resolves.toMatchObject({
      message: 'Full feedback',
    });
    await updateAdminHelpSubmissionStatus(fetchImpl, 8, 'reviewed');

    const updateInit = fetchImpl.mock.calls[1][1];
    expect(updateInit.method).toBe('PUT');
    expect(updateInit.body).toBe(JSON.stringify({ status: 'reviewed' }));
  });

  it('maps submission creation to the existing API payload', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ submission: { id: 1 } }, 201));

    await submitHelpSubmission(fetchImpl, {
      type: 'contact',
      message: 'Help',
      urgentSafetyIssue: true,
      wantsReply: true,
      replyEmail: 'person@example.com',
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      type: 'contact',
      message: 'Help',
      urgent_safety_issue: true,
      wants_reply: true,
      reply_email: 'person@example.com',
    });
  });
});
