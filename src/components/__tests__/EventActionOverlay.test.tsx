/**
 * Tests for EventActionOverlay component
 * Comprehensive tests covering all overlay types:
 * - invite, manage, confirm, result, pendingRequest, report, menu, viewIntro
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import EventActionOverlay from '../EventActionOverlay';

describe('EventActionOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Visibility', () => {
    it('should not render when isVisible is false', () => {
      render(
        <EventActionOverlay
          isVisible={false}
          type="menu"
          items={[{ label: 'Test', onPress: jest.fn() }]}
        />,
      );

      expect(screen.queryByTestId('bottom-sheet-modal')).toBeNull();
    });

    it('should render when isVisible is true', () => {
      render(
        <EventActionOverlay
          isVisible={true}
          type="menu"
          items={[{ label: 'Test', onPress: jest.fn() }]}
        />,
      );

      expect(screen.getByTestId('bottom-sheet-modal')).toBeTruthy();
    });
  });

  describe('Backdrop Press', () => {
    it('should call onBackdropPress when backdrop is pressed', () => {
      const onBackdropPress = jest.fn();

      render(
        <EventActionOverlay
          isVisible={true}
          type="menu"
          items={[{ label: 'Test', onPress: jest.fn() }]}
          onBackdropPress={onBackdropPress}
        />,
      );

      fireEvent.press(screen.getByTestId('bottom-sheet-backdrop'));

      expect(onBackdropPress).toHaveBeenCalledTimes(1);
    });

    it('should not throw when onBackdropPress is undefined', () => {
      render(
        <EventActionOverlay
          isVisible={true}
          type="menu"
          items={[{ label: 'Test', onPress: jest.fn() }]}
        />,
      );

      expect(() => fireEvent.press(screen.getByTestId('bottom-sheet-backdrop'))).not.toThrow();
    });
  });

  describe('Invite Type', () => {
    const inviteProps = {
      isVisible: true,
      type: 'invite' as const,
      inviteMessage: '',
      onInviteMessageChange: jest.fn(),
      onSendInvite: jest.fn(),
    };

    it('should render invite prompt', () => {
      render(<EventActionOverlay {...inviteProps} />);

      expect(screen.getByTestId('action-item-invite')).toBeTruthy();
    });

    it('should render text input for message', () => {
      render(<EventActionOverlay {...inviteProps} />);

      expect(
        screen.getByPlaceholderText('Send an intro about you and why you would like to join.'),
      ).toBeTruthy();
    });

    it('should show "Send Introduction" button text', () => {
      render(<EventActionOverlay {...inviteProps} />);

      expect(screen.getByText('Send Introduction')).toBeTruthy();
    });

    it('should call onInviteMessageChange when text changes', () => {
      const onInviteMessageChange = jest.fn();
      render(<EventActionOverlay {...inviteProps} onInviteMessageChange={onInviteMessageChange} />);

      const input = screen.getByPlaceholderText(
        'Send an intro about you and why you would like to join.',
      );
      fireEvent.changeText(input, 'Hello, I would love to join!');

      expect(onInviteMessageChange).toHaveBeenCalledWith('Hello, I would love to join!');
    });

    it('should call onSendInvite when button is pressed', () => {
      const onSendInvite = jest.fn();
      render(<EventActionOverlay {...inviteProps} onSendInvite={onSendInvite} />);

      fireEvent.press(screen.getByTestId('action-item-invite'));

      expect(onSendInvite).toHaveBeenCalledTimes(1);
    });

    it('should show "Sending..." when submitting', () => {
      render(<EventActionOverlay {...inviteProps} inviteSubmitting={true} />);

      expect(screen.getByText('Sending…')).toBeTruthy();
    });

    it('should disable button when submitting', () => {
      render(<EventActionOverlay {...inviteProps} inviteSubmitting={true} />);

      const button = screen.getByTestId('action-item-invite');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    it('should disable button when inviteDisabled is true', () => {
      render(<EventActionOverlay {...inviteProps} inviteDisabled={true} />);

      const button = screen.getByTestId('action-item-invite');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    it('should show error when inviteError is set', () => {
      render(<EventActionOverlay {...inviteProps} inviteError="Please include a message" />);

      expect(screen.getByText('Please include a message')).toBeTruthy();
    });

    it('should display current message value', () => {
      render(<EventActionOverlay {...inviteProps} inviteMessage="I am excited to join!" />);

      const input = screen.getByPlaceholderText(
        'Send an intro about you and why you would like to join.',
      );
      expect(input.props.value).toBe('I am excited to join!');
    });
  });

  describe('Manage Type', () => {
    const manageProps = {
      isVisible: true,
      type: 'manage' as const,
      onEdit: jest.fn(),
      onDelete: jest.fn(),
    };

    it('should render manage prompt', () => {
      render(<EventActionOverlay {...manageProps} />);

      expect(screen.getByTestId('action-item-edit')).toBeTruthy();
      expect(screen.getByTestId('action-item-delete')).toBeTruthy();
    });

    it('should render Edit Event button', () => {
      render(<EventActionOverlay {...manageProps} />);

      expect(screen.getByText('Edit Event')).toBeTruthy();
    });

    it('should render Delete Event button', () => {
      render(<EventActionOverlay {...manageProps} />);

      expect(screen.getByText('Delete Event')).toBeTruthy();
    });

    it('should call onEdit when Edit button is pressed', () => {
      const onEdit = jest.fn();
      render(<EventActionOverlay {...manageProps} onEdit={onEdit} />);

      fireEvent.press(screen.getByTestId('action-item-edit'));

      expect(onEdit).toHaveBeenCalledTimes(1);
    });

    it('should call onDelete when Delete button is pressed', () => {
      const onDelete = jest.fn();
      render(<EventActionOverlay {...manageProps} onDelete={onDelete} />);

      fireEvent.press(screen.getByTestId('action-item-delete'));

      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Confirm Type', () => {
    const confirmProps = {
      isVisible: true,
      type: 'confirm' as const,
      title: 'Delete this event?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      onConfirm: jest.fn(),
      onCancel: jest.fn(),
      confirmTone: 'destructive' as const,
    };

    it('should render confirm prompt', () => {
      render(<EventActionOverlay {...confirmProps} />);

      expect(screen.getByText('Delete this event?')).toBeTruthy();
    });

    it('should show title', () => {
      render(<EventActionOverlay {...confirmProps} />);

      expect(screen.getByText('Delete this event?')).toBeTruthy();
    });

    it('should show description', () => {
      render(<EventActionOverlay {...confirmProps} />);

      expect(screen.getByText('This action cannot be undone.')).toBeTruthy();
    });

    it('should show confirm label', () => {
      render(<EventActionOverlay {...confirmProps} />);

      expect(screen.getByText('Delete')).toBeTruthy();
    });

    it('should show cancel label', () => {
      render(<EventActionOverlay {...confirmProps} />);

      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('should call onConfirm when confirm button is pressed', () => {
      const onConfirm = jest.fn();
      render(<EventActionOverlay {...confirmProps} confirmTone="default" onConfirm={onConfirm} />);

      fireEvent.press(screen.getByText('Delete'));

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when cancel button is pressed', () => {
      const onCancel = jest.fn();
      render(<EventActionOverlay {...confirmProps} onCancel={onCancel} />);

      fireEvent.press(screen.getByText('Cancel'));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should show "Deleting..." when loading', () => {
      render(<EventActionOverlay {...confirmProps} isConfirmLoading={true} />);

      expect(screen.getByText('Deleting...')).toBeTruthy();
    });

    it('should show error message when provided', () => {
      render(<EventActionOverlay {...confirmProps} errorMessage="Failed to delete event" />);

      expect(screen.getByText('Failed to delete event')).toBeTruthy();
    });

    it('should render with default tone', () => {
      render(<EventActionOverlay {...confirmProps} confirmTone="default" />);

      expect(screen.getByText('Delete')).toBeTruthy();
    });
  });

  describe('Result Type', () => {
    const resultProps = {
      isVisible: true,
      type: 'result' as const,
      title: 'Event deleted',
      description: 'The event has been removed.',
      dismissLabel: 'Done',
      onDismiss: jest.fn(),
      tone: 'success' as const,
    };

    it('should render result prompt', () => {
      render(<EventActionOverlay {...resultProps} />);

      expect(screen.getByTestId('action-item-dismiss')).toBeTruthy();
    });

    it('should show title', () => {
      render(<EventActionOverlay {...resultProps} />);

      expect(screen.getByText('Event deleted')).toBeTruthy();
    });

    it('should show description', () => {
      render(<EventActionOverlay {...resultProps} />);

      expect(screen.getByText('The event has been removed.')).toBeTruthy();
    });

    it('should show dismiss label', () => {
      render(<EventActionOverlay {...resultProps} />);

      expect(screen.getByText('Done')).toBeTruthy();
    });

    it('should call onDismiss when dismiss button is pressed', () => {
      const onDismiss = jest.fn();
      render(<EventActionOverlay {...resultProps} onDismiss={onDismiss} />);

      fireEvent.press(screen.getByTestId('action-item-dismiss'));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('should render without description', () => {
      render(<EventActionOverlay {...resultProps} description={undefined} />);

      expect(screen.getByText('Event deleted')).toBeTruthy();
      expect(screen.queryByText('The event has been removed.')).toBeNull();
    });

    it('should render with error tone', () => {
      render(<EventActionOverlay {...resultProps} title="Error occurred" tone="error" />);

      expect(screen.getByText('Error occurred')).toBeTruthy();
    });

    it('should render with default tone', () => {
      render(<EventActionOverlay {...resultProps} tone="default" />);

      expect(screen.getByText('Event deleted')).toBeTruthy();
    });
  });

  describe('PendingRequest Type', () => {
    const pendingProps = {
      isVisible: true,
      type: 'pendingRequest' as const,
      onCancelRequest: jest.fn(),
      onReportEvent: jest.fn(),
    };

    it('should render pending request prompt', () => {
      render(<EventActionOverlay {...pendingProps} />);

      expect(screen.getByTestId('action-item-cancel')).toBeTruthy();
      expect(screen.getByTestId('action-item-report')).toBeTruthy();
    });

    it('should show Cancel Request button', () => {
      render(<EventActionOverlay {...pendingProps} />);

      expect(screen.getByText('Cancel Request')).toBeTruthy();
    });

    it('should show Report Event button', () => {
      render(<EventActionOverlay {...pendingProps} />);

      expect(screen.getByText('Report Event')).toBeTruthy();
    });

    it('should call onCancelRequest when cancel button is pressed', () => {
      const onCancelRequest = jest.fn();
      render(<EventActionOverlay {...pendingProps} onCancelRequest={onCancelRequest} />);

      fireEvent.press(screen.getByTestId('action-item-cancel'));

      expect(onCancelRequest).toHaveBeenCalledTimes(1);
    });

    it('should call onReportEvent when report button is pressed', () => {
      const onReportEvent = jest.fn();
      render(<EventActionOverlay {...pendingProps} onReportEvent={onReportEvent} />);

      fireEvent.press(screen.getByTestId('action-item-report'));

      expect(onReportEvent).toHaveBeenCalledTimes(1);
    });

    it('should show "Cancelling..." when cancelling', () => {
      render(<EventActionOverlay {...pendingProps} isCancelling={true} />);

      expect(screen.getByText('Cancelling…')).toBeTruthy();
    });

    it('should disable cancel button when cancelling', () => {
      render(<EventActionOverlay {...pendingProps} isCancelling={true} />);

      const button = screen.getByTestId('action-item-cancel');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Report Type', () => {
    const reportProps = {
      isVisible: true,
      type: 'report' as const,
      reportMessage: '',
      onReportMessageChange: jest.fn(),
      onSubmitReport: jest.fn(),
    };

    it('should render report prompt', () => {
      render(<EventActionOverlay {...reportProps} />);

      expect(screen.getByTestId('action-item-submit-report')).toBeTruthy();
    });

    it('should render text input for reason', () => {
      render(<EventActionOverlay {...reportProps} />);

      expect(screen.getByPlaceholderText('Tell us why you are reporting this event')).toBeTruthy();
    });

    it('should show "Submit Report" button text', () => {
      render(<EventActionOverlay {...reportProps} />);

      expect(screen.getByText('Submit Report')).toBeTruthy();
    });

    it('should call onReportMessageChange when text changes', () => {
      const onReportMessageChange = jest.fn();
      render(<EventActionOverlay {...reportProps} onReportMessageChange={onReportMessageChange} />);

      const input = screen.getByPlaceholderText('Tell us why you are reporting this event');
      fireEvent.changeText(input, 'This event is spam');

      expect(onReportMessageChange).toHaveBeenCalledWith('This event is spam');
    });

    it('should call onSubmitReport when button is pressed', () => {
      const onSubmitReport = jest.fn();
      render(<EventActionOverlay {...reportProps} onSubmitReport={onSubmitReport} />);

      fireEvent.press(screen.getByTestId('action-item-submit-report'));

      expect(onSubmitReport).toHaveBeenCalledTimes(1);
    });

    it('should show "Submitting..." when submitting', () => {
      render(<EventActionOverlay {...reportProps} reportSubmitting={true} />);

      expect(screen.getByText('Submitting…')).toBeTruthy();
    });

    it('should disable button when submitting', () => {
      render(<EventActionOverlay {...reportProps} reportSubmitting={true} />);

      const button = screen.getByTestId('action-item-submit-report');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    it('should disable button when reportDisabled is true', () => {
      render(<EventActionOverlay {...reportProps} reportDisabled={true} />);

      const button = screen.getByTestId('action-item-submit-report');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    it('should show error when reportError is set', () => {
      render(<EventActionOverlay {...reportProps} reportError="Please provide a reason" />);

      expect(screen.getByText('Please provide a reason')).toBeTruthy();
    });

    it('should display current report message value', () => {
      render(<EventActionOverlay {...reportProps} reportMessage="This is inappropriate content" />);

      const input = screen.getByPlaceholderText('Tell us why you are reporting this event');
      expect(input.props.value).toBe('This is inappropriate content');
    });
  });

  describe('Menu Type', () => {
    const menuItems = [
      { label: 'Edit', onPress: jest.fn() },
      { label: 'Delete', onPress: jest.fn(), destructive: true },
    ];

    const menuProps = {
      isVisible: true,
      type: 'menu' as const,
      items: menuItems,
    };

    it('should render menu prompt', () => {
      render(<EventActionOverlay {...menuProps} />);

      expect(screen.getByTestId('action-item-menu-0')).toBeTruthy();
      expect(screen.getByTestId('action-item-menu-1')).toBeTruthy();
    });

    it('should render all menu items', () => {
      render(<EventActionOverlay {...menuProps} />);

      expect(screen.getByText('Edit')).toBeTruthy();
      expect(screen.getByText('Delete')).toBeTruthy();
    });

    it('should call onPress for first item', () => {
      const onPress = jest.fn();
      const items = [
        { label: 'Edit', onPress },
        { label: 'Delete', onPress: jest.fn() },
      ];

      render(<EventActionOverlay isVisible={true} type="menu" items={items} />);

      fireEvent.press(screen.getByTestId('action-item-menu-0'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should call onPress for second item', () => {
      const onPress = jest.fn();
      const items = [
        { label: 'Edit', onPress: jest.fn() },
        { label: 'Delete', onPress },
      ];

      render(<EventActionOverlay isVisible={true} type="menu" items={items} />);

      fireEvent.press(screen.getByTestId('action-item-menu-1'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should render menu with single item', () => {
      render(
        <EventActionOverlay
          isVisible={true}
          type="menu"
          items={[{ label: 'Only Item', onPress: jest.fn() }]}
        />,
      );

      expect(screen.getByText('Only Item')).toBeTruthy();
      expect(screen.getByTestId('action-item-menu-0')).toBeTruthy();
    });

    it('should render menu with many items', () => {
      const manyItems = [
        { label: 'Item 1', onPress: jest.fn() },
        { label: 'Item 2', onPress: jest.fn() },
        { label: 'Item 3', onPress: jest.fn() },
        { label: 'Item 4', onPress: jest.fn() },
      ];

      render(<EventActionOverlay isVisible={true} type="menu" items={manyItems} />);

      expect(screen.getByText('Item 1')).toBeTruthy();
      expect(screen.getByText('Item 2')).toBeTruthy();
      expect(screen.getByText('Item 3')).toBeTruthy();
      expect(screen.getByText('Item 4')).toBeTruthy();
    });

    it('should handle loading state for menu items', () => {
      const items = [{ label: 'Delete', onPress: jest.fn(), loading: true }];

      render(<EventActionOverlay isVisible={true} type="menu" items={items} />);

      // When loading, label should have ellipsis
      expect(screen.getByText('Delete…')).toBeTruthy();
    });

    it('should disable item when loading', () => {
      const items = [{ label: 'Delete', onPress: jest.fn(), loading: true }];

      render(<EventActionOverlay isVisible={true} type="menu" items={items} />);

      const button = screen.getByTestId('action-item-menu-0');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    it('should disable item when disabled prop is true', () => {
      const items = [{ label: 'Disabled Item', onPress: jest.fn(), disabled: true }];

      render(<EventActionOverlay isVisible={true} type="menu" items={items} />);

      const button = screen.getByTestId('action-item-menu-0');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('ViewIntro Type', () => {
    const viewIntroProps = {
      isVisible: true,
      type: 'viewIntro' as const,
      introMessage: 'Hello, I am excited to join!',
      onDismiss: jest.fn(),
    };

    it('should render view intro prompt', () => {
      render(<EventActionOverlay {...viewIntroProps} />);

      expect(screen.getByTestId('action-item-done')).toBeTruthy();
    });

    it('should show "Your Introduction" title', () => {
      render(<EventActionOverlay {...viewIntroProps} />);

      expect(screen.getByText('Your Introduction')).toBeTruthy();
    });

    it('should show intro message in quotes', () => {
      render(<EventActionOverlay {...viewIntroProps} />);

      expect(screen.getByText('"Hello, I am excited to join!"')).toBeTruthy();
    });

    it('should show Done button', () => {
      render(<EventActionOverlay {...viewIntroProps} />);

      expect(screen.getByText('Done')).toBeTruthy();
    });

    it('should call onDismiss when Done is pressed', () => {
      const onDismiss = jest.fn();
      render(<EventActionOverlay {...viewIntroProps} onDismiss={onDismiss} />);

      fireEvent.press(screen.getByTestId('action-item-done'));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('should display different intro messages', () => {
      render(
        <EventActionOverlay
          {...viewIntroProps}
          introMessage="I love hiking and outdoor activities!"
        />,
      );

      expect(screen.getByText('"I love hiking and outdoor activities!"')).toBeTruthy();
    });
  });

  describe('Confirmation Modal Flow', () => {
    it('should support delete confirmation flow', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(
        <EventActionOverlay
          isVisible={true}
          type="confirm"
          title="Delete Event?"
          description="This will permanently delete the event."
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={onConfirm}
          onCancel={onCancel}
          confirmTone="destructive"
        />,
      );

      expect(screen.getByText('Delete Event?')).toBeTruthy();
      expect(screen.getByText('This will permanently delete the event.')).toBeTruthy();

      // User decides to cancel
      fireEvent.press(screen.getByText('Keep'));
      expect(onCancel).toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('should support leave event confirmation flow', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(
        <EventActionOverlay
          isVisible={true}
          type="confirm"
          title="Leave Event?"
          description="You will no longer be part of this event."
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByText('Leave Event?')).toBeTruthy();

      // User confirms leaving
      fireEvent.press(screen.getByText('Leave'));
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  describe('Input Modal Flow', () => {
    it('should support invite flow with message input', () => {
      const onSendInvite = jest.fn();
      const onInviteMessageChange = jest.fn();

      render(
        <EventActionOverlay
          isVisible={true}
          type="invite"
          inviteMessage=""
          onInviteMessageChange={onInviteMessageChange}
          onSendInvite={onSendInvite}
        />,
      );

      const input = screen.getByPlaceholderText(
        'Send an intro about you and why you would like to join.',
      );

      // Type a message
      fireEvent.changeText(input, 'Hi, I love coffee and would be great to meet!');
      expect(onInviteMessageChange).toHaveBeenCalledWith(
        'Hi, I love coffee and would be great to meet!',
      );

      // Send the invite
      fireEvent.press(screen.getByTestId('action-item-invite'));
      expect(onSendInvite).toHaveBeenCalled();
    });

    it('should support report flow with message input', () => {
      const onSubmitReport = jest.fn();
      const onReportMessageChange = jest.fn();

      render(
        <EventActionOverlay
          isVisible={true}
          type="report"
          reportMessage=""
          onReportMessageChange={onReportMessageChange}
          onSubmitReport={onSubmitReport}
        />,
      );

      const input = screen.getByPlaceholderText('Tell us why you are reporting this event');

      // Type a report reason
      fireEvent.changeText(input, 'This event contains inappropriate content');
      expect(onReportMessageChange).toHaveBeenCalledWith(
        'This event contains inappropriate content',
      );

      // Submit the report
      fireEvent.press(screen.getByTestId('action-item-submit-report'));
      expect(onSubmitReport).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have button accessibility role for invite button', () => {
      render(
        <EventActionOverlay
          isVisible={true}
          type="invite"
          inviteMessage=""
          onInviteMessageChange={jest.fn()}
          onSendInvite={jest.fn()}
        />,
      );

      const button = screen.getByTestId('action-item-invite');
      expect(button.props.accessibilityRole).toBe('button');
    });

    it('should have button accessibility role for menu items', () => {
      render(
        <EventActionOverlay
          isVisible={true}
          type="menu"
          items={[{ label: 'Test', onPress: jest.fn() }]}
        />,
      );

      const button = screen.getByTestId('action-item-menu-0');
      expect(button.props.accessibilityRole).toBe('button');
    });

    it('should have button accessibility role for destructive confirm actions', () => {
      render(
        <EventActionOverlay
          isVisible={true}
          type="confirm"
          title="Leave this event?"
          description="You'll need to request to join again if you change your mind."
          confirmLabel="Leave Event"
          cancelLabel="Stay"
          confirmTone="destructive"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const button = screen.getByLabelText('Leave Event');
      expect(button.props.accessibilityRole).toBe('button');
    });

    it('should have accessibility label for invite input', () => {
      render(
        <EventActionOverlay
          isVisible={true}
          type="invite"
          inviteMessage=""
          onInviteMessageChange={jest.fn()}
          onSendInvite={jest.fn()}
        />,
      );

      const input = screen.getByPlaceholderText(
        'Send an intro about you and why you would like to join.',
      );
      expect(input.props.accessibilityLabel).toBe(
        'Send an intro about you and why you would like to join.',
      );
    });

    it('should have accessibility label for report input', () => {
      render(
        <EventActionOverlay
          isVisible={true}
          type="report"
          reportMessage=""
          onReportMessageChange={jest.fn()}
          onSubmitReport={jest.fn()}
        />,
      );

      const input = screen.getByPlaceholderText('Tell us why you are reporting this event');
      expect(input.props.accessibilityLabel).toBe('Tell us why you are reporting this event');
    });
  });
});
