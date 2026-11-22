import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react-native';

import LoadErrorState from '../LoadErrorState';

describe('LoadErrorState', () => {
  it('renders the message, a labelled error mark and a retry button', () => {
    const onRetry = jest.fn();
    render(
      <LoadErrorState
        message="Unable to load plans"
        iconAccessibilityLabel="Unable to load plans"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Unable to load plans')).toBeTruthy();
    expect(screen.getByLabelText('Unable to load plans')).toBeTruthy();

    fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the button without a retry handler', () => {
    render(<LoadErrorState message="Unable to load plans" iconAccessibilityLabel="Error" />);

    expect(screen.queryByText('Try again')).toBeNull();
  });
});
