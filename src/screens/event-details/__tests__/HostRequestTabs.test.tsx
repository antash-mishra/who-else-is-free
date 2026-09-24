import React from 'react';

import { GestureHandlerRefContext } from '@react-navigation/stack';
import { fireEvent, render } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';

import { EVENT_DETAILS_BACK_EDGE_WIDTH } from '@navigation/transitions';

import HostRequestTabs, {
  HOST_TABS_ACTIVE_OFFSET_X,
  HOST_TABS_EDGE_BACK_RELEASE_X,
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

  const dragFrom = (startX: number, deltaX: number) => {
    const gesture = latestPanGesture();
    const onTouchesDown = gesture.onTouchesDown.mock.calls[0][0];
    const onTouchesMove = gesture.onTouchesMove.mock.calls[0][0];
    const manager = { fail: jest.fn() };

    onTouchesDown({ changedTouches: [{ absoluteX: startX }] }, manager);
    onTouchesMove({ changedTouches: [{ absoluteX: startX + deltaX }] }, manager);
    return manager.fail;
  };
  const RIGHTWARD = HOST_TABS_EDGE_BACK_RELEASE_X + 1;

  it('releases a rightward drag from the back edge zone on Requests to the stack', () => {
    render(<HostRequestTabs {...baseProps} />);

    expect(dragFrom(EVENT_DETAILS_BACK_EDGE_WIDTH - 1, RIGHTWARD)).toHaveBeenCalledTimes(1);
  });

  it('keeps other Requests drags for the pager', () => {
    render(<HostRequestTabs {...baseProps} />);

    // Leftward from the edge zone still pages to Members.
    expect(dragFrom(EVENT_DETAILS_BACK_EDGE_WIDTH - 1, -RIGHTWARD)).not.toHaveBeenCalled();
    // Rightward from the interior does not navigate back.
    expect(dragFrom(EVENT_DETAILS_BACK_EDGE_WIDTH + 1, RIGHTWARD)).not.toHaveBeenCalled();
  });

  it('keeps a rightward drag from the edge zone on Members for returning to Requests', () => {
    const { getByTestId } = render(<HostRequestTabs {...baseProps} />);
    fireEvent.press(getByTestId('event-details-tab-members'));

    expect(dragFrom(1, RIGHTWARD)).not.toHaveBeenCalled();
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
