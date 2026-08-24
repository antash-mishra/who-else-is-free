import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react-native';

import EventListLoadState from '../EventListLoadState';

describe('EventListLoadState', () => {
  it('renders only the loading indicator for the loading state', () => {
    render(<EventListLoadState status="loading" />);

    expect(screen.getByTestId('event-list-loading-state')).toBeTruthy();
    expect(screen.getByTestId('event-list-loading-indicator')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('renders an accessible error state and retries', () => {
    const onRetry = jest.fn();
    render(
      <EventListLoadState status="error" errorMessage="Unable to load plans." onRetry={onRetry} />,
    );

    expect(screen.getByTestId('event-list-error-state')).toBeTruthy();
    expect(screen.getByLabelText('Unable to load plans')).toBeTruthy();
    expect(screen.getByText('Unable to load plans.')).toBeTruthy();

    fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
