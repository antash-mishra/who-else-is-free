import BottomSheetModal from '@components/BottomSheetModal';
import EventActionBadge from '@components/EventActionBadge';
import EventActionOverlay from '@components/EventActionOverlay';
import SignInButtons from '@components/SignInButtons';

type ActionMenuItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
};

type EventDetailsOverlayRoutesProps = {
  shouldShowInvitePrompt: boolean;
  inviteMessage: string;
  onInviteMessageChange: (text: string) => void;
  onSendInvite: () => void;
  inviteError: string | null;
  isSendingInvite: boolean;
  onCloseInvitePrompt: () => void;
  showManagePrompt: boolean;
  onCloseManagePrompt: () => void;
  onEdit: () => void;
  onDeletePrompt: () => void;
  showDeleteConfirm: boolean;
  onDelete: () => void;
  onDeleteCancel: () => void;
  deleteError: string | null;
  isDeleting: boolean;
  showPendingRequestPrompt: boolean;
  onClosePendingRequestPrompt: () => void;
  onCancelRequest: () => void;
  onOpenReportPrompt: () => void;
  isCancellingRequest: boolean;
  showReportPrompt: boolean;
  onCloseReportPrompt: () => void;
  reportMessage: string;
  onReportMessageChange: (text: string) => void;
  onSubmitReport: () => void;
  reportError: string | null;
  isSubmittingReport: boolean;
  showMenuOverlay: boolean;
  onCloseMenuOverlay: () => void;
  menuItems: ActionMenuItem[];
  showViewIntroOverlay: boolean;
  onCloseViewIntroOverlay: () => void;
  userIntroMessage: string | null;
  showLeaveConfirm: boolean;
  onLeaveEvent: () => void;
  onLeaveCancel: () => void;
  isLeaving: boolean;
  leaveError: string | null;
  showMemberMenu: boolean;
  onCloseMemberMenu: () => void;
  selectedMemberName?: string | null;
  onReportMemberFromMenu: () => void;
  onRemovePromptFromMenu: () => void;
  showRemoveConfirm: boolean;
  onRemoveMember: () => void;
  onRemoveCancel: () => void;
  isRemovingMember: boolean;
  removeError: string | null;
  isSingleEvent: boolean;
  showEventUpdatedBadge: boolean;
  onEventUpdatedBadgeHidden: () => void;
  showRequestSentBadge: boolean;
  onRequestSentBadgeHidden: () => void;
  showRequestCancelledBadge: boolean;
  onRequestCancelledBadgeHidden: () => void;
  removedMemberBadgeLabel: string | null;
  onRemovedMemberBadgeHidden: () => void;
  reportedMemberBadgeLabel: string | null;
  onReportedMemberBadgeHidden: () => void;
  signInVisible: boolean;
  onCloseSignIn: () => void;
};

const getFirstName = (name?: string | null, fallback = 'Member') => name?.split(' ')[0] ?? fallback;

const EventDetailsOverlayRoutes = ({
  shouldShowInvitePrompt,
  inviteMessage,
  onInviteMessageChange,
  onSendInvite,
  inviteError,
  isSendingInvite,
  onCloseInvitePrompt,
  showManagePrompt,
  onCloseManagePrompt,
  onEdit,
  onDeletePrompt,
  showDeleteConfirm,
  onDelete,
  onDeleteCancel,
  deleteError,
  isDeleting,
  showPendingRequestPrompt,
  onClosePendingRequestPrompt,
  onCancelRequest,
  onOpenReportPrompt,
  isCancellingRequest,
  showReportPrompt,
  onCloseReportPrompt,
  reportMessage,
  onReportMessageChange,
  onSubmitReport,
  reportError,
  isSubmittingReport,
  showMenuOverlay,
  onCloseMenuOverlay,
  menuItems,
  showViewIntroOverlay,
  onCloseViewIntroOverlay,
  userIntroMessage,
  showLeaveConfirm,
  onLeaveEvent,
  onLeaveCancel,
  isLeaving,
  leaveError,
  showMemberMenu,
  onCloseMemberMenu,
  selectedMemberName,
  onReportMemberFromMenu,
  onRemovePromptFromMenu,
  showRemoveConfirm,
  onRemoveMember,
  onRemoveCancel,
  isRemovingMember,
  removeError,
  isSingleEvent,
  showEventUpdatedBadge,
  onEventUpdatedBadgeHidden,
  showRequestSentBadge,
  onRequestSentBadgeHidden,
  showRequestCancelledBadge,
  onRequestCancelledBadgeHidden,
  removedMemberBadgeLabel,
  onRemovedMemberBadgeHidden,
  reportedMemberBadgeLabel,
  onReportedMemberBadgeHidden,
  signInVisible,
  onCloseSignIn,
}: EventDetailsOverlayRoutesProps) => {
  const memberFirstName = getFirstName(selectedMemberName);
  const memberTitleName = getFirstName(selectedMemberName, 'this member');

  return (
    <>
      <EventActionOverlay
        isVisible={shouldShowInvitePrompt}
        onBackdropPress={isSendingInvite ? undefined : onCloseInvitePrompt}
        type="invite"
        inviteMessage={inviteMessage}
        onInviteMessageChange={onInviteMessageChange}
        onSendInvite={onSendInvite}
        inviteError={inviteError}
        inviteSubmitting={isSendingInvite}
        inviteDisabled={!inviteMessage.trim()}
      />
      <EventActionOverlay
        isVisible={showManagePrompt}
        onBackdropPress={onCloseManagePrompt}
        type="manage"
        onEdit={onEdit}
        onDelete={onDeletePrompt}
      />
      <EventActionOverlay
        isVisible={showDeleteConfirm}
        onBackdropPress={isDeleting ? undefined : onDeleteCancel}
        type="confirm"
        title="Delete this event?"
        description="This will remove the event for everyone and can't be undone."
        confirmLabel="Delete event"
        cancelLabel="Keep event"
        confirmTone="destructive"
        onConfirm={onDelete}
        onCancel={onDeleteCancel}
        isConfirmLoading={isDeleting}
        errorMessage={deleteError}
      />
      <EventActionOverlay
        isVisible={showPendingRequestPrompt}
        onBackdropPress={isCancellingRequest ? undefined : onClosePendingRequestPrompt}
        type="pendingRequest"
        onCancelRequest={onCancelRequest}
        onReportEvent={onOpenReportPrompt}
        isCancelling={isCancellingRequest}
      />
      <EventActionOverlay
        isVisible={showReportPrompt}
        onBackdropPress={isSubmittingReport ? undefined : onCloseReportPrompt}
        type="report"
        reportMessage={reportMessage}
        onReportMessageChange={onReportMessageChange}
        onSubmitReport={onSubmitReport}
        reportError={reportError}
        reportSubmitting={isSubmittingReport}
        reportDisabled={!reportMessage.trim()}
      />
      <EventActionOverlay
        isVisible={showMenuOverlay}
        onBackdropPress={onCloseMenuOverlay}
        type="menu"
        items={menuItems}
      />
      <EventActionOverlay
        isVisible={showViewIntroOverlay}
        onBackdropPress={onCloseViewIntroOverlay}
        type="viewIntro"
        introMessage={userIntroMessage ?? ''}
        onDismiss={onCloseViewIntroOverlay}
      />
      <EventActionOverlay
        isVisible={showLeaveConfirm}
        onBackdropPress={isLeaving ? undefined : onLeaveCancel}
        type="confirm"
        title="Leave this event?"
        description="You'll need to request to join again if you change your mind."
        confirmLabel="Leave Event"
        cancelLabel="Stay"
        confirmTone="destructive"
        onConfirm={onLeaveEvent}
        onCancel={onLeaveCancel}
        isConfirmLoading={isLeaving}
        errorMessage={leaveError}
      />
      <EventActionOverlay
        isVisible={showMemberMenu}
        onBackdropPress={onCloseMemberMenu}
        type="menu"
        items={[
          {
            label: `Report & Block ${memberFirstName}`,
            onPress: onReportMemberFromMenu,
          },
          {
            label: `Remove ${memberFirstName}`,
            onPress: onRemovePromptFromMenu,
            destructive: true,
          },
        ]}
      />
      <EventActionOverlay
        isVisible={showRemoveConfirm}
        onBackdropPress={isRemovingMember ? undefined : onRemoveCancel}
        type="confirm"
        title={`Remove ${memberTitleName}?`}
        description={
          isSingleEvent
            ? 'They will be removed from this event and private chat.'
            : 'They will be removed from the group chat and will need to request to join again.'
        }
        confirmLabel={`Remove ${memberFirstName}`}
        cancelLabel="Cancel"
        confirmTone="destructive"
        onConfirm={onRemoveMember}
        onCancel={onRemoveCancel}
        isConfirmLoading={isRemovingMember}
        errorMessage={removeError}
      />
      <EventActionBadge
        visible={showEventUpdatedBadge}
        label="Event details updated"
        onHidden={onEventUpdatedBadgeHidden}
      />
      <EventActionBadge
        visible={showRequestSentBadge}
        label="Requested to join"
        onHidden={onRequestSentBadgeHidden}
      />
      <EventActionBadge
        visible={showRequestCancelledBadge}
        label="Requested to join cancelled"
        onHidden={onRequestCancelledBadgeHidden}
      />
      <EventActionBadge
        visible={removedMemberBadgeLabel != null}
        label={removedMemberBadgeLabel ?? ''}
        onHidden={onRemovedMemberBadgeHidden}
      />
      <EventActionBadge
        visible={reportedMemberBadgeLabel != null}
        label={reportedMemberBadgeLabel ?? ''}
        onHidden={onReportedMemberBadgeHidden}
      />
      <BottomSheetModal visible={signInVisible} onClose={onCloseSignIn}>
        <SignInButtons />
      </BottomSheetModal>
    </>
  );
};

export default EventDetailsOverlayRoutes;
