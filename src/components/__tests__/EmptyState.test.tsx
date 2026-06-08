/**
 * Tests for EmptyState component
 * Covers title/description, action buttons, illustration/image rendering
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { SvgProps } from 'react-native-svg';

import EmptyState from '../EmptyState';

describe('EmptyState', () => {
  const defaultProps = {
    title: 'No Events',
    description: 'There are no events to display.',
  };

  describe('Rendering', () => {
    it('should render empty state container', () => {
      render(<EmptyState {...defaultProps} />);

      expect(screen.getByTestId('empty-state')).toBeTruthy();
    });

    it('should render title', () => {
      render(<EmptyState {...defaultProps} />);

      expect(screen.getByText('No Events')).toBeTruthy();
    });

    it('should render description', () => {
      render(<EmptyState {...defaultProps} />);

      expect(screen.getByText('There are no events to display.')).toBeTruthy();
    });

    it('should render different title and description', () => {
      render(
        <EmptyState
          title="Nothing Happening Here (Yet!)"
          description="There are currently no events available."
        />,
      );

      expect(screen.getByText('Nothing Happening Here (Yet!)')).toBeTruthy();
      expect(screen.getByText('There are currently no events available.')).toBeTruthy();
    });
  });

  describe('Illustration', () => {
    it('should render default illustration when no imageSource', () => {
      const { UNSAFE_queryAllByType } = render(<EmptyState {...defaultProps} />);
      const { View, Image } = require('react-native');

      // Should render SVG mock (View with svg-mock testID), not Image
      const images = UNSAFE_queryAllByType(Image);
      expect(images.length).toBe(0);
    });

    it('should render custom illustration component', () => {
      const CustomIllustration = () => {
        const { View } = require('react-native');
        return <View testID="custom-illustration" />;
      };

      render(<EmptyState {...defaultProps} illustration={CustomIllustration} />);

      expect(screen.getByTestId('custom-illustration')).toBeTruthy();
    });

    it('should use custom illustration size', () => {
      const CustomIllustration: React.FC<SvgProps> = ({ width, height }) => {
        const { View } = require('react-native');
        const resolvedWidth = typeof width === 'number' ? width : 0;
        const resolvedHeight = typeof height === 'number' ? height : 0;
        return (
          <View
            testID="sized-illustration"
            style={{ width: resolvedWidth, height: resolvedHeight }}
          />
        );
      };

      render(
        <EmptyState {...defaultProps} illustration={CustomIllustration} illustrationSize={300} />,
      );

      const illustration = screen.getByTestId('sized-illustration');
      expect(illustration.props.style).toEqual({ width: 300, height: 300 });
    });
  });

  describe('Image Source', () => {
    it('should render image when imageSource is provided', () => {
      const { UNSAFE_getByType } = render(
        <EmptyState {...defaultProps} imageSource={{ uri: 'https://example.com/image.png' }} />,
      );
      const { Image } = require('react-native');

      const image = UNSAFE_getByType(Image);
      expect(image.props.source.uri).toBe('https://example.com/image.png');
    });

    it('should use default image size', () => {
      const { UNSAFE_getByType } = render(
        <EmptyState {...defaultProps} imageSource={{ uri: 'https://example.com/image.png' }} />,
      );
      const { Image, StyleSheet } = require('react-native');

      const image = UNSAFE_getByType(Image);
      expect(StyleSheet.flatten(image.props.style)).toEqual(
        expect.objectContaining({ width: 245, height: 245 }),
      );
    });

    it('should use custom image size', () => {
      const { UNSAFE_getByType } = render(
        <EmptyState
          {...defaultProps}
          imageSource={{ uri: 'https://example.com/image.png' }}
          imageSize={200}
        />,
      );
      const { Image, StyleSheet } = require('react-native');

      const image = UNSAFE_getByType(Image);
      expect(StyleSheet.flatten(image.props.style)).toEqual(
        expect.objectContaining({ width: 200, height: 200 }),
      );
    });

    it('should prefer image over illustration when both provided', () => {
      const CustomIllustration = () => {
        const { View } = require('react-native');
        return <View testID="custom-illustration" />;
      };

      const { UNSAFE_queryByType } = render(
        <EmptyState
          {...defaultProps}
          illustration={CustomIllustration}
          imageSource={{ uri: 'https://example.com/image.png' }}
        />,
      );
      const { Image } = require('react-native');

      // Image should be rendered
      const image = UNSAFE_queryByType(Image);
      expect(image).toBeTruthy();
      expect(image?.props.source.uri).toBe('https://example.com/image.png');

      // Illustration should not be rendered
      expect(screen.queryByTestId('custom-illustration')).toBeNull();
    });
  });

  describe('Action Button', () => {
    it('should not render action button when actionLabel is undefined', () => {
      render(<EmptyState {...defaultProps} />);

      expect(screen.queryByTestId('empty-state-action')).toBeNull();
    });

    it('should render action button when actionLabel is provided', () => {
      render(<EmptyState {...defaultProps} actionLabel="Create Event" onActionPress={() => {}} />);

      expect(screen.getByTestId('empty-state-action')).toBeTruthy();
      expect(screen.getByText('Create Event')).toBeTruthy();
    });

    it('should call onActionPress when action button is pressed', () => {
      const onActionPress = jest.fn();

      render(
        <EmptyState {...defaultProps} actionLabel="Create Event" onActionPress={onActionPress} />,
      );

      fireEvent.press(screen.getByTestId('empty-state-action'));

      expect(onActionPress).toHaveBeenCalledTimes(1);
    });

    it('should render with different action label', () => {
      render(<EmptyState {...defaultProps} actionLabel="Add New Event" onActionPress={() => {}} />);

      expect(screen.getByText('Add New Event')).toBeTruthy();
    });
  });

  describe('Secondary Action Button', () => {
    it('should not render secondary button when secondaryActionLabel is undefined', () => {
      render(<EmptyState {...defaultProps} actionLabel="Create Event" onActionPress={() => {}} />);

      expect(screen.queryByText('Explore')).toBeNull();
    });

    it('should render secondary button when secondaryActionLabel is provided', () => {
      render(
        <EmptyState
          {...defaultProps}
          secondaryActionLabel="Explore"
          onSecondaryActionPress={() => {}}
        />,
      );

      expect(screen.getByText('Explore')).toBeTruthy();
    });

    it('should call onSecondaryActionPress when secondary button is pressed', () => {
      const onSecondaryActionPress = jest.fn();

      render(
        <EmptyState
          {...defaultProps}
          secondaryActionLabel="Explore"
          onSecondaryActionPress={onSecondaryActionPress}
        />,
      );

      fireEvent.press(screen.getByText('Explore'));

      expect(onSecondaryActionPress).toHaveBeenCalledTimes(1);
    });

    it('should render with different secondary action label', () => {
      render(
        <EmptyState
          {...defaultProps}
          secondaryActionLabel="Browse Events"
          onSecondaryActionPress={() => {}}
        />,
      );

      expect(screen.getByText('Browse Events')).toBeTruthy();
    });
  });

  describe('Both Action Buttons', () => {
    it('should render both buttons when both labels are provided', () => {
      const onActionPress = jest.fn();
      const onSecondaryActionPress = jest.fn();

      render(
        <EmptyState
          {...defaultProps}
          actionLabel="Create Event"
          onActionPress={onActionPress}
          secondaryActionLabel="Explore"
          onSecondaryActionPress={onSecondaryActionPress}
        />,
      );

      expect(screen.getByText('Create Event')).toBeTruthy();
      expect(screen.getByText('Explore')).toBeTruthy();
    });

    it('should call correct handler for each button', () => {
      const onActionPress = jest.fn();
      const onSecondaryActionPress = jest.fn();

      render(
        <EmptyState
          {...defaultProps}
          actionLabel="Create Event"
          onActionPress={onActionPress}
          secondaryActionLabel="Explore"
          onSecondaryActionPress={onSecondaryActionPress}
        />,
      );

      fireEvent.press(screen.getByTestId('empty-state-action'));
      expect(onActionPress).toHaveBeenCalledTimes(1);
      expect(onSecondaryActionPress).not.toHaveBeenCalled();

      fireEvent.press(screen.getByText('Explore'));
      expect(onSecondaryActionPress).toHaveBeenCalledTimes(1);
      expect(onActionPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Button Container', () => {
    it('should not render button container when no actions', () => {
      const { UNSAFE_root } = render(<EmptyState {...defaultProps} />);

      // Check that there are no Pressable elements for buttons
      const pressables = UNSAFE_root.findAllByType(require('react-native').Pressable);
      expect(pressables.length).toBe(0);
    });

    it('should render button container when at least one action is provided', () => {
      render(<EmptyState {...defaultProps} actionLabel="Create Event" onActionPress={() => {}} />);

      expect(screen.getByTestId('empty-state-action')).toBeTruthy();
    });
  });

  describe('Use Cases', () => {
    it('should render empty events state', () => {
      render(
        <EmptyState
          title="No Events Yet"
          description="Create your first event to get started!"
          actionLabel="Create Event"
          onActionPress={() => {}}
        />,
      );

      expect(screen.getByText('No Events Yet')).toBeTruthy();
      expect(screen.getByText('Create your first event to get started!')).toBeTruthy();
      expect(screen.getByText('Create Event')).toBeTruthy();
    });

    it('should render no messages state', () => {
      render(
        <EmptyState
          title="No Messages"
          description="Start a conversation by joining an event!"
          secondaryActionLabel="Browse Events"
          onSecondaryActionPress={() => {}}
        />,
      );

      expect(screen.getByText('No Messages')).toBeTruthy();
      expect(screen.getByText('Browse Events')).toBeTruthy();
    });

    it('should render search results empty state', () => {
      render(
        <EmptyState title="No Results Found" description="Try adjusting your search or filters." />,
      );

      expect(screen.getByText('No Results Found')).toBeTruthy();
      expect(screen.getByText('Try adjusting your search or filters.')).toBeTruthy();
    });
  });
});
