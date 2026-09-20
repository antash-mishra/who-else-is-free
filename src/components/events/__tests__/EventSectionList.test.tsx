import React from 'react';

import { SectionList } from 'react-native';

import { fireEvent, render } from '@testing-library/react-native';

import { resetPlacedIds } from '@components/motion';
import { motionTiming } from '@theme/motion';

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

  it('opens a pressed row without a shared flight outside the transition provider', () => {
    const onEventPress = jest.fn();
    const { getByText } = render(
      <EventSectionList sections={sections} onEventPress={onEventPress} />,
    );
    fireEvent.press(getByText('Pub quiz'));
    expect(onEventPress).toHaveBeenCalledWith(sections[0].data[0], false);
  });

  it('still renders the event titles', () => {
    const { getByText } = render(<EventSectionList sections={sections} onEventPress={jest.fn()} />);
    expect(getByText('Pub quiz')).toBeTruthy();
    expect(getByText('Five-a-side')).toBeTruthy();
  });

  it('uses the overall row position for the entry-animation cutoff across sections', () => {
    const staticRowIndex = motionTiming.staggerMaxSteps + 1;
    const manySections = Array.from({ length: staticRowIndex + 1 }, (_, sectionIndex) => ({
      title: `Day ${sectionIndex}`,
      data: [
        {
          id: `event-${sectionIndex}`,
          title: `Plan ${sectionIndex}`,
          location: 'Dublin',
          time: '19:00',
          audience: 'Everyone',
          imageUri: 'https://example.test/cover.jpg',
        },
      ],
    }));
    const view = render(<EventSectionList sections={manySections} onEventPress={jest.fn()} />);
    const list = view.UNSAFE_getByType(SectionList);
    const firstStaticRow = list.props.renderItem({
      item: manySections[staticRowIndex].data[0],
      index: 0,
      section: manySections[staticRowIndex],
      separators: {},
    });

    expect(firstStaticRow.props.index).toBe(staticRowIndex);
  });
});
