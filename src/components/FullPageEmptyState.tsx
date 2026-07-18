import { ReactNode } from 'react';

import { StyleSheet, useWindowDimensions, View } from 'react-native';

/**
 * Fraction of the screen height at which full-page empty states are anchored
 * (measured from the top of the screen). Shared so every empty state — whether
 * rendered as a screen-level overlay (this component) or top-padded inside a
 * list — lands at the same vertical position, with no shift between screens.
 *
 * Signed-out empty states sit slightly higher to make room for the "Continue"
 * button below their description.
 */
export const EMPTY_STATE_TOP_FRACTION = 0.3;
export const EMPTY_STATE_TOP_FRACTION_SIGNED_OUT = 0.24;

interface FullPageEmptyStateProps {
  /** Only render when the screen's list is actually empty. */
  visible: boolean;
  /** Fraction of screen height for the top anchor. Defaults to the logged-in value. */
  topFraction?: number;
  children: ReactNode;
}

/**
 * Screen-level positioner for full-page empty states on single-list screens
 * (Chat, Notifications, Past Events, Join Requests). Renders as a sibling of
 * the screen container so it is positioned relative to the whole screen, then
 * anchors the empty state at `EMPTY_STATE_TOP_FRACTION` of the screen height —
 * independent of header height, safe-area edges, or list structure.
 *
 * `pointerEvents="box-none"` lets touches (e.g. pull-to-refresh) pass through
 * to the list underneath, while the empty-state content itself stays tappable.
 */
const FullPageEmptyState = ({
  visible,
  topFraction = EMPTY_STATE_TOP_FRACTION,
  children,
}: FullPageEmptyStateProps) => {
  const { height } = useWindowDimensions();

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.anchor, { top: height * topFraction }]} pointerEvents="box-none">
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});

export default FullPageEmptyState;
