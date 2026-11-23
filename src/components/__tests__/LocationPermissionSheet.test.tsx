import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react-native';

import LocationPermissionSheet, {
  LOCATION_PERMISSION_DESCRIPTION,
  LOCATION_PERMISSION_TITLE,
} from '../location-permission/LocationPermissionSheet';

jest.mock('@components/BottomSheetModal', () => {
  const { View } = require('react-native');
  return ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? <View testID="sheet">{children}</View> : null;
});

describe('LocationPermissionSheet', () => {
  it('explains location access and offers Continue and Close', () => {
    const onContinue = jest.fn();
    const onDismiss = jest.fn();
    render(
      <LocationPermissionSheet
        visible
        onContinue={onContinue}
        onDismiss={onDismiss}
        onClosed={jest.fn()}
      />,
    );

    expect(screen.getByText(LOCATION_PERMISSION_TITLE)).toBeTruthy();
    expect(screen.getByText(LOCATION_PERMISSION_DESCRIPTION)).toBeTruthy();

    fireEvent.press(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('Close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
