import React from 'react';

import { GestureHandlerRefContext } from '@react-navigation/stack';
import { fireEvent, render } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';

import { EVENT_DETAILS_BACK_EDGE_WIDTH } from '@navigation/transitions';

import HostRequestTabs, {
  HOST_TABS_ACTIVE_OFFSET_X,
  HOST_TABS_FAIL_OFFSET_Y,
} from '../HostRequestTabs';

const baseProps = {
  isSingleEvent: false,
  pendingRequests: [],
  acceptedRequests: [],
  confirmedMembers: [{ id: 2, name: 'Liam Test' }],
  expandedRequestIds: new Set<number>(),
  acceptingUserId: null,
  decliningUserId: null,
  onToggleRequestExpanded: jest.fn(),
  onAcceptRequest: jest.fn(),
  onDeclineRequest: jest.fn(),
  onRequesterPress: jest.fn(),
  onOpenMemberMenu: jest.fn(),
};

const latestPanGesture = () => {
  const panMock = Gesture.Pan as jest.Mock;
  return panMock.mock.results[panMock.mock.results.length - 1].value;
};

describe('HostRequestTabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('direction-locks horizontal paging so vertical drags fail to the parent scroll view', () => {
    render(<HostRequestTabs {...baseProps} />);

    const gesture = latestPanGesture();

    expect(gesture.activeOffsetX).toHaveBeenCalledWith([...HOST_TABS_ACTIVE_OFFSET_X]);
    expect(gesture.failOffsetY).toHaveBeenCalledWith([...HOST_TABS_FAIL_OFFSET_Y]);
  });

  it('gives touches in the stack back edge to navigation rather than the pager', () => {
    render(<HostRequestTabs {...baseProps} />);

    const gesture = latestPanGesture();
    const onTouchesDown = gesture.onTouchesDown.mock.calls[0][0];
    const manager = { fail: jest.fn() };

    onTouchesDown({ changedTouches: [{ absoluteX: EVENT_DETAILS_BACK_EDGE_WIDTH - 1 }] }, manager);
    expect(manager.fail).toHaveBeenCalledTimes(1);

    onTouchesDown({ changedTouches: [{ absoluteX: EVENT_DETAILS_BACK_EDGE_WIDTH + 1 }] }, manager);
    expect(manager.fail).toHaveBeenCalledTimes(1);
  });

  it('makes the stack back gesture wait for the pager inside its bounds', () => {
    // Android also offers pager touches to the stack pan (RNGH measures its
    // edge hitSlop against the overflowing two-page row), so interior
    // horizontal drags must resolve in the pager first.
    const stackGestureRef = { current: {} as React.ComponentType };
    render(
      <GestureHandlerRefContext.Provider value={stackGestureRef}>
        <HostRequestTabs {...baseProps} />
      </GestureHandlerRefContext.Provider>,
    );

    const gesture = latestPanGesture();
    expect(gesture.blocksExternalGesture).toHaveBeenCalledWith(stackGestureRef);
  });

  it('makes only the selected page interactive and accessible', () => {
    const { getByTestId, queryByTestId } = render(<HostRequestTabs {...baseProps} />);

    fireEvent.press(getByTestId('event-details-tab-members'));

    expect(getByTestId('event-details-tab-members').props.accessibilityState.selected).toBe(true);
    expect(queryByTestId('event-details-host-page-requests')).toBeNull();
    expect(getByTestId('event-details-host-page-members').props.pointerEvents).toBe('auto');
  });
});
