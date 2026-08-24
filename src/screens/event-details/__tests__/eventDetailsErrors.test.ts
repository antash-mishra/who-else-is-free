import {
  getJoinRequestError,
  getMemberReportError,
  getPlanReportError,
  JOIN_REQUEST_GENERIC_ERROR,
  PLAN_REPORT_GENERIC_ERROR,
} from '../eventDetailsErrors';

describe('eventDetailsErrors', () => {
  it.each([
    [409, 'You already have a pending request for this plan.'],
    [403, "You can't join this plan."],
    [404, 'This plan is no longer available.'],
    [400, JOIN_REQUEST_GENERIC_ERROR],
    [500, JOIN_REQUEST_GENERIC_ERROR],
  ])('maps join-request status %s to safe copy', (status, expected) => {
    expect(getJoinRequestError(status)).toBe(expected);
  });

  it('maps plan-report failures without exposing server text', () => {
    expect(getPlanReportError(409)).toBe('You have already reported this plan.');
    expect(getPlanReportError(500)).toBe(PLAN_REPORT_GENERIC_ERROR);
  });

  it('includes the member first name in a generic member-report failure', () => {
    expect(getMemberReportError(500, 'Liam')).toBe("Couldn't report Liam. Please try again.");
    expect(getMemberReportError(409, 'Liam')).toBe('You have already reported this member.');
  });
});
