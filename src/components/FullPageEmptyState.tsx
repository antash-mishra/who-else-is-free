import { ReactNode } from 'react';

import { StyleSheet, useWindowDimensions, View } from 'react-native';

/**
 * Fraction of the screen height used to anchor full-page empty states. The
 * illustration's bottom edge (roughly where the title begins) lands near this
 * line, so titles line up across every screen regardless of illustration height
 * or description length — with no shift between screens.
 *
 * Signed-out empty states sit slightly higher to make room for the "Continue"
 * button below their description.
 */
export const EMPTY_STATE_TITLE_FRACTION = 0.5;
export const EMPTY_STATE_TITLE_FRACTION_SIGNED_OUT = 0.45;

/**
 * Hand-tuned nudge added after the fraction/image math. `fraction - imageHeight`
 * alone placed the block a touch high, so this pushes it down to where it looked
 * right on device. Increase to move all empty states down, decrease to move up.
 */
const EMPTY_STATE_TOP_OFFSET = 50;

/**
 * Where to place the TOP of the empty-state block (illustration + title +
 * description), measured from the top of the screen.
 *
 * The goal is that the TITLE lands at the same vertical line on every full-page
 * empty state, so switching between screens (Discover, My Events, Chat,
 * Notifications, Past Events, Join Requests) shows no vertical "jump".
 *
 * Formula:  screenHeight * fraction  -  imageHeight  +  EMPTY_STATE_TOP_OFFSET
 *   • screenHeight * fraction  → the target line (e.g. 50% down the screen).
 *   • - imageHeight            → the block starts with the illustration, and the
 *                                title sits BELOW it. Subtracting the image
 *                                height shifts the block up by the illustration
 *                                so the title (not the image top) is what lands
 *                                near the target line. Because we subtract the
 *                                actual image height, the title stays aligned
 *                                even if illustrations have different heights.
 *   • + EMPTY_STATE_TOP_OFFSET → small manual correction to taste.
 *
 * Same value is used by BOTH the screen-level overlay (this component) and the
 * paged screens that top-pad the empty state inside a list, so both land in the
 * exact same place.
 */
export const emptyStateAnchorTop = (
  screenHeight: number,
  imageHeight: number,
  titleFraction: number = EMPTY_STATE_TITLE_FRACTION,
) => Math.max(0, Math.round(screenHeight * titleFraction - imageHeight + EMPTY_STATE_TOP_OFFSET));

interface FullPageEmptyStateProps {
  /** Only render when the screen's list is actually empty. */
  visible: boolean;
  /** Illustration height, used to anchor the title at `titleFraction`. */
  imageHeight: number;
  /** Fraction of screen height for the title anchor. Defaults to the logged-in value. */
  titleFraction?: number;
  children: ReactNode;
}

/**
 * Screen-level positioner for full-page empty states on single-list screens
 * (Chat, Notifications, Past Events, Join Requests). Renders as a sibling of
 * the screen container so it is positioned relative to the whole screen, then
 * anchors the title at `titleFraction` of the screen height — independent of
 * header height, safe-area edges, list structure, or illustration height.
 *
 * `pointerEvents="box-none"` lets touches (e.g. pull-to-refresh) pass through
 * to the list underneath, while the empty-state content itself stays tappable.
 */
const FullPageEmptyState = ({
  visible,
  imageHeight,
  titleFraction = EMPTY_STATE_TITLE_FRACTION,
  children,
}: FullPageEmptyStateProps) => {
  const { height } = useWindowDimensions();

  if (!visible) {
    return null;
  }

  return (
    <View
      style={[styles.anchor, { top: emptyStateAnchorTop(height, imageHeight, titleFraction) }]}
      pointerEvents="box-none"
    >
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
