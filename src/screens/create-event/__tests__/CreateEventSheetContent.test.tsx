import React from 'react';

import { render } from '@testing-library/react-native';

import { EventDateTimePickerContent } from '@components/EventDateTimeModal';

import CreateEventSheetContent from '../CreateEventSheetContent';

describe('CreateEventSheetContent date/time entry', () => {
  it('makes the picker visible before the opening animation has settled', () => {
    const props: React.ComponentProps<typeof CreateEventSheetContent> = {
      renderedSheet: 'dateTime',
      activeSheet: 'dateTime',
      isSheetReady: false,
      selectedDateTime: new Date(2026, 9, 4, 19, 30),
      pickerMinDate: new Date(2026, 9, 4, 12),
      pickerMaxDate: new Date(2026, 10, 3, 12),
      onConfirmDateTime: jest.fn(),
      coverKey: 'synthetic-cover',
      onSelectCover: jest.fn(),
      tempGroupType: 'Group',
      onSelectTempGroupType: jest.fn(),
      onConfirmGroupType: jest.fn(),
      tempGender: 'Any',
      onSelectTempGender: jest.fn(),
      onConfirmGender: jest.fn(),
      savedAgeRange: [18, 99],
      hasCustomCover: false,
      tempAgeRange: [18, 60],
      onSelectTempAgeRange: jest.fn(),
      onConfirmAge: jest.fn(),
      selectedLocationLabel: '',
      countryCode: null,
      onSelectLocation: jest.fn(),
      description: '',
      onDescriptionDone: jest.fn(),
      onClose: jest.fn(),
    };
    const view = render(<CreateEventSheetContent {...props} />);
    expect(view.UNSAFE_getByType(EventDateTimePickerContent).props.visible).toBe(true);
  });
});
