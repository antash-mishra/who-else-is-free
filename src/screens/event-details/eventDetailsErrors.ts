export const JOIN_REQUEST_GENERIC_ERROR = "Couldn't send request. Please try again.";
export const PLAN_REPORT_GENERIC_ERROR = "Couldn't submit report. Please try again.";

export const getJoinRequestError = (status: number): string => {
  switch (status) {
    case 409:
      return 'You already have a pending request for this plan.';
    case 403:
      return "You can't join this plan.";
    case 404:
      return 'This plan is no longer available.';
    default:
      return JOIN_REQUEST_GENERIC_ERROR;
  }
};

export const getPlanReportError = (status: number): string =>
  status === 409 ? 'You have already reported this plan.' : PLAN_REPORT_GENERIC_ERROR;

export const getMemberReportError = (status: number, firstName?: string): string => {
  if (status === 409) {
    return 'You have already reported this member.';
  }
  return firstName ? `Couldn't report ${firstName}. Please try again.` : PLAN_REPORT_GENERIC_ERROR;
};
