import React from 'react';

import { render } from '@testing-library/react-native';

import EventActionOverlay from '@components/EventActionOverlay';

import EventDetailsOverlayRoutes from '../EventDetailsOverlayRoutes';

const props: React.ComponentProps<typeof EventDetailsOverlayRoutes> = {
  shouldShowInvitePrompt: false,
  inviteMessage: '',
  onInviteMessageChange: jest.fn(),
  onSendInvite: jest.fn(),
  inviteError: null,
  isSendingInvite: false,
  onCloseInvitePrompt: jest.fn(),
  showDeleteConfirm: false,
  onDelete: jest.fn(),
  onDeleteCancel: jest.fn(),
  deleteError: null,
  isDeleting: false,
  showReportPrompt: false,
  onCloseReportPrompt: jest.fn(),
  reportMessage: '',
  onReportMessageChange: jest.fn(),
  onSubmitReport: jest.fn(),
  reportError: null,
  isSubmittingReport: false,
  showMenuOverlay: false,
  onCloseMenuOverlay: jest.fn(),
  menuItems: [],
  showViewIntroOverlay: false,
  onCloseViewIntroOverlay: jest.fn(),
  userIntroMessage: null,
  showLeaveConfirm: false,
  onLeaveEvent: jest.fn(),
  onLeaveCancel: jest.fn(),
  isLeaving: false,
  leaveError: null,
  showMemberMenu: false,
  onCloseMemberMenu: jest.fn(),
  selectedMemberName: null,
  onReportMemberFromMenu: jest.fn(),
  onRemovePromptFromMenu: jest.fn(),
  showReportMemberConfirm: false,
  onReportMemberConfirm: jest.fn(),
  onReportMemberCancel: jest.fn(),
  showRemoveConfirm: false,
  onRemoveMember: jest.fn(),
  onRemoveCancel: jest.fn(),
  isRemovingMember: false,
  removeError: null,
  isSingleEvent: false,
  showEventUpdatedBadge: false,
  onEventUpdatedBadgeHidden: jest.fn(),
  showRequestSentBadge: false,
  onRequestSentBadgeHidden: jest.fn(),
  showRequestCancelledBadge: false,
  onRequestCancelledBadgeHidden: jest.fn(),
  removedMemberBadgeLabel: null,
  onRemovedMemberBadgeHidden: jest.fn(),
  reportedMemberBadgeLabel: null,
  onReportedMemberBadgeHidden: jest.fn(),
  signInVisible: false,
  onCloseSignIn: jest.fn(),
};
test('issue 135: member report prompt identifies the person', () => {
  const view = render(
    <EventDetailsOverlayRoutes {...props} showReportPrompt reportTargetName="Taylor Test" />,
  );
  expect(view.getByPlaceholderText("Tell us why you're reporting Taylor")).toBeTruthy();
});
test('issue 135: viewed intro uses regular text', () => {
  const view = render(
    <EventActionOverlay
      isVisible
      type="viewIntro"
      introMessage="Synthetic intro"
      onDismiss={jest.fn()}
    />,
  );
  expect(view.getByText('"Synthetic intro"')).not.toHaveStyle({ fontStyle: 'italic' });
});

test('plan report keeps plan-specific wording', () => {
  const view = render(<EventDetailsOverlayRoutes {...props} showReportPrompt />);
  expect(view.getByPlaceholderText("Tell us why you're reporting this plan")).toBeTruthy();
});
test('remove confirmation has a concise CTA and centered header', () => {
  const view = render(
    <EventDetailsOverlayRoutes {...props} showRemoveConfirm selectedMemberName="Taylor Test" />,
  );
  expect(view.getByRole('button', { name: 'Remove' })).toBeTruthy();
  expect(view.getByText('Remove Taylor?')).toHaveStyle({ textAlign: 'center' });
  expect(view.getByText('They will be removed from this plan and group chat.')).toHaveStyle({
    textAlign: 'center',
  });
});
test('report confirmation has a concise CTA', () => {
  const view = render(
    <EventDetailsOverlayRoutes
      {...props}
      showReportMemberConfirm
      selectedMemberName="Taylor Test"
    />,
  );
  expect(view.getByRole('button', { name: 'Report & block' })).toBeTruthy();
});
