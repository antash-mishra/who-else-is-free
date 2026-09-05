import React from 'react';

import { render } from '@testing-library/react-native';

import { resetPlacedIds } from '@components/motion';

import EventDetailsInfo from '../EventDetailsInfo';

const baseProps = {
  title: 'Pub quiz',
  hostLine: 'Hosted by Sam',
  readOnly: false,
  isSingleEvent: false,
  goingParticipants: [
    { id: 1, name: 'Ada', avatar: null },
    { id: 2, name: 'Bo', avatar: null },
  ],
  goingCount: 2,
  location: 'Dublin',
  scheduleLine: 'Tonight at 19:00',
  audienceLine: 'Everyone',
  description: 'Bring a team.',
};

describe('EventDetailsInfo going avatars', () => {
  beforeEach(() => {
    resetPlacedIds();
  });

  it('places each going avatar', () => {
    const { getByTestId } = render(<EventDetailsInfo {...baseProps} />);
    expect(getByTestId('placed-going-0')).toBeTruthy();
    expect(getByTestId('placed-going-1')).toBeTruthy();
  });

  it('keeps the existing going testIDs', () => {
    const { getByTestId } = render(<EventDetailsInfo {...baseProps} />);
    expect(getByTestId('going-avatar-0')).toBeTruthy();
    expect(getByTestId('going-count-label')).toBeTruthy();
  });
});
