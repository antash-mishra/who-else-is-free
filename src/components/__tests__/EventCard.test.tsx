/**
 * Tests for EventCard component
 * Covers rendering, badge display, and visual states
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';

import EventCard from '../EventCard';
import { mockEvents } from '../../__tests__/mocks/mockData';

describe('EventCard', () => {
  const defaultProps = {
    id: '1',
    title: 'Coffee Meetup',
    location: 'Central Park',
    time: '10:00',
    audience: 'All Gender, 18 to 35 years',
    imageUri: 'https://example.com/coffee.jpg',
  };

  describe('Rendering', () => {
    it('should render event card container', () => {
      render(<EventCard {...defaultProps} />);

      expect(screen.getByTestId('event-card')).toBeTruthy();
    });

    it('should render event title', () => {
      render(<EventCard {...defaultProps} />);

      expect(screen.getByText('Coffee Meetup')).toBeTruthy();
    });

    it('should render event location and time', () => {
      render(<EventCard {...defaultProps} />);

      expect(screen.getByText('Central Park, 10:00')).toBeTruthy();
    });

    it('should render only the place name when location includes a full address', () => {
      render(<EventCard {...defaultProps} location="Temple Bar, Dublin, Ireland" />);

      expect(screen.getByText('Temple Bar, 10:00')).toBeTruthy();
      expect(screen.queryByText('Temple Bar, Dublin, Ireland, 10:00')).toBeNull();
    });

    it('should render event audience', () => {
      render(<EventCard {...defaultProps} />);

      expect(screen.getByText('All Gender, 18 to 35 years')).toBeTruthy();
    });

    it('should render metaLine when provided', () => {
      render(<EventCard {...defaultProps} metaLine="Group, 30-40" />);

      expect(screen.getByText('Group, 30-40')).toBeTruthy();
      expect(screen.queryByText(defaultProps.audience)).toBeNull();
    });

    it('should render event image', () => {
      const { UNSAFE_getByProps } = render(<EventCard {...defaultProps} />);

      expect(UNSAFE_getByProps({ recyclingKey: 'https://example.com/coffee.jpg' })).toBeTruthy();
    });

    it('should render with mock event data', () => {
      const event = mockEvents[0];
      render(
        <EventCard
          id={event.id}
          title={event.title}
          location={event.location}
          time={event.time}
          audience={event.audience}
          imageUri={event.imageUri}
        />
      );

      expect(screen.getByText(event.title)).toBeTruthy();
      expect(screen.getByText(`${event.location}, ${event.time}`)).toBeTruthy();
      expect(screen.getByText(event.audience)).toBeTruthy();
    });
  });

  describe('Badge Display', () => {
    it('should not show badge when badgeLabel is undefined', () => {
      render(<EventCard {...defaultProps} />);

      expect(screen.queryByTestId('event-card-badge')).toBeNull();
    });

    it('should show Pending badge', () => {
      render(<EventCard {...defaultProps} badgeLabel="Pending" />);

      expect(screen.getByTestId('event-card-badge')).toBeTruthy();
      expect(screen.getByText('Pending')).toBeTruthy();
    });

    it('should show Hosting badge', () => {
      render(<EventCard {...defaultProps} badgeLabel="Hosting" />);

      expect(screen.getByTestId('event-card-badge')).toBeTruthy();
      expect(screen.getByText('Hosting')).toBeTruthy();
    });

    it('should show Joined badge', () => {
      render(<EventCard {...defaultProps} badgeLabel="Joined" />);

      expect(screen.getByTestId('event-card-badge')).toBeTruthy();
      expect(screen.getByText('Joined')).toBeTruthy();
    });

    it('should not show badge for invalid badge type', () => {
      render(<EventCard {...defaultProps} badgeLabel="InvalidBadge" />);

      expect(screen.queryByTestId('event-card-badge')).toBeNull();
    });

    it('should not show badge for empty string', () => {
      render(<EventCard {...defaultProps} badgeLabel="" />);

      expect(screen.queryByTestId('event-card-badge')).toBeNull();
    });
  });

  describe('Text Truncation', () => {
    it('should truncate long title with numberOfLines', () => {
      const longTitle = 'This is a very long event title that should be truncated because it exceeds the available space';
      render(<EventCard {...defaultProps} title={longTitle} />);

      const titleElement = screen.getByText(longTitle);
      expect(titleElement.props.numberOfLines).toBe(1);
    });

    it('should truncate meta line with numberOfLines', () => {
      const longLocation = 'Very Long Location Name That Exceeds Available Space';
      render(<EventCard {...defaultProps} location={longLocation} />);

      const metaElement = screen.getByText(`${longLocation}, 10:00`);
      expect(metaElement.props.numberOfLines).toBe(1);
    });

    it('should truncate audience with numberOfLines', () => {
      const longAudience = 'All Gender, 18 to 65 years, all experience levels welcome, beginners and experts alike';
      render(<EventCard {...defaultProps} audience={longAudience} />);

      const audienceElement = screen.getByText(longAudience);
      expect(audienceElement.props.numberOfLines).toBe(1);
    });

    it('should truncate metaLine with numberOfLines', () => {
      const longMetaLine = '1:1, Female, 30-40, experienced hikers only';
      render(<EventCard {...defaultProps} metaLine={longMetaLine} />);

      const metaLineElement = screen.getByText(longMetaLine);
      expect(metaLineElement.props.numberOfLines).toBe(1);
    });
  });

  describe('Different Event Types', () => {
    it('should render today event', () => {
      const todayEvent = mockEvents.find(e => e.dateLabel === 'Today');
      if (!todayEvent) throw new Error('No today event in mock data');

      render(
        <EventCard
          id={todayEvent.id}
          title={todayEvent.title}
          location={todayEvent.location}
          time={todayEvent.time}
          audience={todayEvent.audience}
          imageUri={todayEvent.imageUri}
        />
      );

      expect(screen.getByText(todayEvent.title)).toBeTruthy();
    });

    it('should render tomorrow event', () => {
      const tomorrowEvent = mockEvents.find(e => e.dateLabel === 'Tmrw');
      if (!tomorrowEvent) throw new Error('No tomorrow event in mock data');

      render(
        <EventCard
          id={tomorrowEvent.id}
          title={tomorrowEvent.title}
          location={tomorrowEvent.location}
          time={tomorrowEvent.time}
          audience={tomorrowEvent.audience}
          imageUri={tomorrowEvent.imageUri}
        />
      );

      expect(screen.getByText(tomorrowEvent.title)).toBeTruthy();
    });

    it('should render group event', () => {
      const groupEvent = mockEvents.find(e => e.groupType === 'Group');
      if (!groupEvent) throw new Error('No group event in mock data');

      render(
        <EventCard
          id={groupEvent.id}
          title={groupEvent.title}
          location={groupEvent.location}
          time={groupEvent.time}
          audience={groupEvent.audience}
          imageUri={groupEvent.imageUri}
        />
      );

      expect(screen.getByText(groupEvent.title)).toBeTruthy();
    });

    it('should render single event', () => {
      const singleEvent = mockEvents.find(e => e.groupType === 'Single');
      if (!singleEvent) throw new Error('No single event in mock data');

      render(
        <EventCard
          id={singleEvent.id}
          title={singleEvent.title}
          location={singleEvent.location}
          time={singleEvent.time}
          audience={singleEvent.audience}
          imageUri={singleEvent.imageUri}
        />
      );

      expect(screen.getByText(singleEvent.title)).toBeTruthy();
    });
  });

  describe('Multiple Events', () => {
    it('should render multiple event cards', () => {
      const { unmount } = render(<EventCard {...defaultProps} />);
      expect(screen.getByText('Coffee Meetup')).toBeTruthy();
      unmount();

      render(
        <EventCard
          id="2"
          title="Hiking Adventure"
          location="Mountain Trail"
          time="08:00"
          audience="All Gender, 21 to 40 years"
          imageUri="https://example.com/hiking.jpg"
        />
      );
      expect(screen.getByText('Hiking Adventure')).toBeTruthy();
    });
  });
});
