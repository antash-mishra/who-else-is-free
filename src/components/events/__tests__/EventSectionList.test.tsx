import React from 'react';

import { render } from '@testing-library/react-native';

import { resetPlacedIds } from '@components/motion';

import EventSectionList from '../EventSectionList';

const sections = [
  {
    title: 'Today',
    data: [
      {
        id: 'e1',
        title: 'Pub quiz',
        location: 'Dublin',
        time: '19:00',
        audience: 'Everyone',
        imageUri: 'https://example.test/a.jpg',
      },
      {
        id: 'e2',
        title: 'Five-a-side',
        location: 'Dublin',
        time: '20:00',
        audience: 'Everyone',
        imageUri: 'https://example.test/b.jpg',
      },
    ],
  },
];

describe('EventSectionList', () => {
  beforeEach(() => {
    resetPlacedIds();
  });

  it('wraps each row in a Placed entry keyed by event id', () => {
    const { getByTestId } = render(
      <EventSectionList sections={sections} onEventPress={jest.fn()} />,
    );
    expect(getByTestId('placed-e1')).toBeTruthy();
    expect(getByTestId('placed-e2')).toBeTruthy();
  });

  it('still renders the event titles', () => {
    const { getByText } = render(<EventSectionList sections={sections} onEventPress={jest.fn()} />);
    expect(getByText('Pub quiz')).toBeTruthy();
    expect(getByText('Five-a-side')).toBeTruthy();
  });
});
