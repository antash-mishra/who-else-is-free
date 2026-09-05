import React from 'react';

import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import EventDetailsCTA from '../EventDetailsCTA';

const baseProps = {
  showStandardCta: true,
  showOpenChatCta: false,
  shouldShowInvitePrompt: false,
  hasPendingRequest: false,
  ctaLabel: 'Interested',
  isOwner: false,
  bottomInset: 0,
  onCtaPress: jest.fn(),
  onOpenChat: jest.fn(),
};

describe('EventDetailsCTA', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the cta label', () => {
    const { getByText } = render(<EventDetailsCTA {...baseProps} />);
    expect(getByText('Interested')).toBeTruthy();
  });

  it('stamps the label when stampKey changes', () => {
    const sequence = jest.spyOn(Reanimated, 'withSequence');
    const { rerender } = render(<EventDetailsCTA {...baseProps} stampKey="idle" />);
    sequence.mockClear();
    rerender(
      <EventDetailsCTA
        {...baseProps}
        ctaLabel="Requested"
        hasPendingRequest
        stampKey="requested"
      />,
    );
    expect(sequence).toHaveBeenCalled();
  });

  it('does not stamp when reduce motion is on', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const sequence = jest.spyOn(Reanimated, 'withSequence');
    const { rerender } = render(<EventDetailsCTA {...baseProps} stampKey="idle" />);
    sequence.mockClear();
    rerender(<EventDetailsCTA {...baseProps} ctaLabel="Requested" stampKey="requested" />);
    expect(sequence).not.toHaveBeenCalled();
  });
});
