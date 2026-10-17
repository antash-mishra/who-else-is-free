import React from 'react';

import { SectionList, StyleSheet } from 'react-native';

import { fireEvent, render } from '@testing-library/react-native';

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

  it('opens a pressed row with the standard navigation callback', () => {
    const onEventPress = jest.fn();
    const { getByText } = render(
      <EventSectionList sections={sections} onEventPress={onEventPress} />,
    );
    fireEvent.press(getByText('Pub quiz'));
    expect(onEventPress).toHaveBeenCalledWith(sections[0].data[0]);
  });

  it('still renders the event titles', () => {
    const { getByText } = render(<EventSectionList sections={sections} onEventPress={jest.fn()} />);
    expect(getByText('Pub quiz')).toBeTruthy();
    expect(getByText('Five-a-side')).toBeTruthy();
  });

  describe('section spacing', () => {
    const twoSections = [
      sections[0],
      {
        title: 'Tomorrow',
        data: [{ ...sections[0].data[0], id: 'e3', title: 'Run club' }],
      },
    ];
    const marginTopOf = (view: ReturnType<typeof render>, title: string) =>
      StyleSheet.flatten(view.getByText(title).props.style).marginTop;

    it('spaces every section header but the first', () => {
      const view = render(<EventSectionList sections={twoSections} onEventPress={jest.fn()} />);

      expect(marginTopOf(view, 'Today')).toBe(0);
      expect(marginTopOf(view, 'Tomorrow')).toBe(22);
    });

    it('does not use a section separator, whose props SectionList keeps from mount', () => {
      // A separator gated on `leadingItem` drew a 22pt gap under the header once a
      // card that mounted lower down moved to the top of its section (Newest).
      const view = render(<EventSectionList sections={twoSections} onEventPress={jest.fn()} />);

      expect(view.UNSAFE_getByType(SectionList).props.SectionSeparatorComponent).toBeUndefined();
    });

    it('keeps the gap the old separator left after the last card', () => {
      const view = render(<EventSectionList sections={sections} onEventPress={jest.fn()} />);
      const footer = view.UNSAFE_getByType(SectionList).props.ListFooterComponent;
      const footerView = render(footer);

      expect(footerView.toJSON()).toBeTruthy();
      const spacer = footerView.UNSAFE_root.findAll(
        (node) => StyleSheet.flatten(node.props.style)?.height === 22,
      );
      expect(spacer.length).toBeGreaterThan(0);
    });
  });
});
