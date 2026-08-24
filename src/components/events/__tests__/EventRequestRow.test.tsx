import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react-native';

import EventRequestRow from '../EventRequestRow';

const baseProps = {
  requester: { id: 7, name: 'Member' },
  message: 'A request introduction',
  expanded: false,
  onToggleExpanded: jest.fn(),
  onAccept: jest.fn(),
  onDecline: jest.fn(),
  isAccepting: false,
  isDeclining: false,
  testID: 'request-row',
};

const fireMessageLayout = (lineTexts: string[]) => {
  fireEvent(screen.getByTestId('request-row-message-measure'), 'textLayout', {
    nativeEvent: { lines: lineTexts.map((text) => ({ text })) },
  });
};

describe('EventRequestRow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not show See more when a long string fits in three rendered lines', () => {
    render(<EventRequestRow {...baseProps} message={'x'.repeat(150)} />);
    fireMessageLayout(['line one', 'line two', 'line three']);

    expect(screen.queryByText('See more')).toBeNull();
  });

  it('shows See more when a short string wraps beyond three rendered lines', () => {
    render(<EventRequestRow {...baseProps} message="short wrapping text" />);
    fireMessageLayout(['one ', 'two ', 'three ', 'four']);

    expect(screen.getByText('See more')).toBeTruthy();
  });

  it('toggles expansion from the inline control', () => {
    render(<EventRequestRow {...baseProps} />);
    fireMessageLayout(['one ', 'two ', 'three ', 'four']);
    fireEvent.press(screen.getByText('See more'));

    expect(baseProps.onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it('renders See less when expanded', () => {
    render(<EventRequestRow {...baseProps} expanded />);

    expect(screen.getByText('See less')).toBeTruthy();
  });
});
