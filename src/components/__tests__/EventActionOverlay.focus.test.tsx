/**
 * Request to join opens straight into the keyboard once its sheet has settled,
 * like the Create Event Details editor (#190).
 */

import React from 'react';

import { TextInput } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react-native';

import EventActionOverlay from '../EventActionOverlay';

jest.mock('../BottomSheetModal', () => {
  const { Pressable, View } = require('react-native');
  return ({ children, onOpened }: { children: React.ReactNode; onOpened?: () => void }) => (
    <View>
      {children}
      <Pressable testID="sheet-opened" onPress={() => onOpened?.()} />
    </View>
  );
});

describe('EventActionOverlay focus', () => {
  let focusSpy: jest.SpyInstance;

  beforeEach(() => {
    focusSpy = jest.spyOn(TextInput.prototype, 'focus');
    focusSpy.mockClear();
  });

  afterEach(() => {
    focusSpy.mockRestore();
  });

  it('focuses the intro field once the request sheet has opened', () => {
    render(
      <EventActionOverlay
        isVisible
        type="invite"
        inviteMessage=""
        onInviteMessageChange={jest.fn()}
        onSendInvite={jest.fn()}
      />,
    );

    expect(focusSpy).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('sheet-opened'));

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves the report field unfocused when its sheet opens', () => {
    render(
      <EventActionOverlay
        isVisible
        type="report"
        reportMessage=""
        onReportMessageChange={jest.fn()}
        onSubmitReport={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('sheet-opened'));

    expect(focusSpy).not.toHaveBeenCalled();
  });
});
