import React from 'react';

import { render } from '@testing-library/react-native';

import type { ChatJoinRequest } from '@api/mappers/chat';

import HostRequestTabs from '../HostRequestTabs';

const request: ChatJoinRequest = {
  id: 1,
  eventId: 10,
  userId: 5,
  message: 'Can I join?',
  status: 'pending',
  createdAt: '2026-09-05T18:00:00Z',
  requester: { id: 5, name: 'Ada' },
};

const baseProps = {
  isSingleEvent: false,
  pendingRequests: [request],
  acceptedRequests: [],
  confirmedMembers: [],
  hostId: 9,
  expandedRequestIds: new Set<number>(),
  acceptingUserId: null,
  decliningUserId: null,
  onToggleRequestExpanded: jest.fn(),
  onAcceptRequest: jest.fn(),
  onDeclineRequest: jest.fn(),
  onRequesterPress: jest.fn(),
  onOpenMemberMenu: jest.fn(),
};

describe('HostRequestTabs', () => {
  it('wraps each pending request in an animated exit container', () => {
    const { getByTestId } = render(<HostRequestTabs {...baseProps} />);
    expect(getByTestId('request-exit-1')).toBeTruthy();
  });

  it('still renders the requester', () => {
    const { getByText } = render(<HostRequestTabs {...baseProps} />);
    expect(getByText('Ada')).toBeTruthy();
  });
});
