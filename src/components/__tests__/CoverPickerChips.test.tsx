import React from 'react';

import { fireEvent, render } from '@testing-library/react-native';

import { CoverPickerContent } from '../CoverPickerModal';

jest.mock('@context/CoversContext', () => ({
  useCovers: () => ({
    covers: [],
    categories: [
      { key: 'sports', label: 'Sports' },
      { key: 'fitness', label: 'Fitness & Wellness' },
    ],
  }),
}));

const isSelected = (view: ReturnType<typeof render>, testID: string) =>
  view.getByTestId(testID).props.accessibilityState?.selected;

describe('CoverPickerContent category chips', () => {
  it('starts with All first and active', () => {
    const view = render(<CoverPickerContent onSelect={jest.fn()} />);

    expect(view.getByText('All')).toBeTruthy();
    expect(isSelected(view, 'cover-chip-all')).toBe(true);
    expect(isSelected(view, 'cover-chip-sports')).toBe(false);
  });

  it('moves the active state to a category and back to All', () => {
    const view = render(<CoverPickerContent onSelect={jest.fn()} />);

    fireEvent.press(view.getByTestId('cover-chip-sports'));
    expect(isSelected(view, 'cover-chip-sports')).toBe(true);
    expect(isSelected(view, 'cover-chip-all')).toBe(false);

    fireEvent.press(view.getByTestId('cover-chip-all'));
    expect(isSelected(view, 'cover-chip-all')).toBe(true);
    expect(isSelected(view, 'cover-chip-sports')).toBe(false);
  });

  it('falls back to All when the active category is tapped again', () => {
    const view = render(<CoverPickerContent onSelect={jest.fn()} />);

    fireEvent.press(view.getByTestId('cover-chip-fitness'));
    fireEvent.press(view.getByTestId('cover-chip-fitness'));

    expect(isSelected(view, 'cover-chip-all')).toBe(true);
    expect(isSelected(view, 'cover-chip-fitness')).toBe(false);
  });

  it('keeps All active when tapped while already active', () => {
    const view = render(<CoverPickerContent onSelect={jest.fn()} />);

    fireEvent.press(view.getByTestId('cover-chip-all'));

    expect(isSelected(view, 'cover-chip-all')).toBe(true);
  });
});
