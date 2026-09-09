import { ReactNode } from 'react';

import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { componentTokens, spacing } from '@theme/index';

/**
 * Fraction of the screen height used to anchor full-page empty states on the
 * stack screens (Notifications, Past Plans, Join Requests, 1:1 Hub). The
 * illustration's bottom edge (roughly where the title begins) lands near this
 * line, so titles line up across those screens regardless of illustration
 * height or description length.
 *
 * The bottom-tab screens use `emptyStateCenteredTop` below instead.
 */
export const EMPTY_STATE_TITLE_FRACTION = 0.5;

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

/**
 * ─── True vertical centring (Discover, My plans, Chat) ───────────────────────
 *
 * The bottom-tab screens centre the whole block on the screen instead of using
 * the fraction anchor above, so there is equal space above and below it. The
 * stack screens (Notifications, Past Plans, Join Requests, 1:1 Hub) stay on the
 * fraction anchor — they sit above no tab bar and under a different header, so
 * their idea of "centre" is not the same one.
 */

/** EmptyState's own container padding, above the illustration and below the last child. */
const BLOCK_PADDING_VERTICAL = spacing.lg;

/**
 * Text block height: the 4px image→title gap (EmptyState pulls `textContainer`
 * up with a negative margin), the 20px title line, the 8px title→description
 * gap, and one 20px description line.
 *
 * Assumes a single-line description. A description that wraps extends below the
 * centre rather than re-centring the block, so screens with different copy
 * lengths stay aligned with each other.
 */
const TEXT_BLOCK_HEIGHT = 52;

/** Action button plus the container's spacing.md gap above it. */
const ACTION_BLOCK_HEIGHT = spacing.md + componentTokens.button.height;

/**
 * Optical correction lifting the block off the true centre. The heavier chrome
 * above (safe area + header, plus a filter row on Discover and My plans) makes
 * a mathematically centred block read slightly low. Increase to move every
 * centred empty state further up, decrease to move down.
 */
const EMPTY_STATE_CENTER_LIFT = 12;

/**
 * Top of the empty-state block such that its own centre sits on the screen's
 * vertical centre, lifted by EMPTY_STATE_CENTER_LIFT.
 *
 * The measured block is illustration + title + description + action button when
 * present, so a signed-out state (which has a button) starts higher and the
 * whole unit stays centred, rather than the illustration holding a fixed line.
 *
 * Same value is used by BOTH the screen-level overlay and the paged screens
 * that top-pad the empty state inside a list, so both land in the same place.
 */
export const emptyStateCenteredTop = (
  screenHeight: number,
  imageHeight: number,
  hasAction = false,
) => {
  const blockHeight =
    BLOCK_PADDING_VERTICAL * 2 +
    imageHeight +
    TEXT_BLOCK_HEIGHT +
    (hasAction ? ACTION_BLOCK_HEIGHT : 0);

  return Math.max(0, Math.round((screenHeight - blockHeight) / 2 - EMPTY_STATE_CENTER_LIFT));
};

interface FullPageEmptyStateProps {
  /** Only render when the screen's list is actually empty. */
  visible: boolean;
  /** Illustration height, used to anchor the title at `titleFraction`. */
  imageHeight: number;
  /** Fraction of screen height for the title anchor. Defaults to the logged-in value. */
  titleFraction?: number;
  /** Centre the block on the screen instead of using the fraction anchor. */
  centered?: boolean;
  /** With `centered`, counts the action button so the whole block stays centred. */
  hasAction?: boolean;
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
  centered = false,
  hasAction = false,
  children,
}: FullPageEmptyStateProps) => {
  const { height } = useWindowDimensions();

  if (!visible) {
    return null;
  }

  const top = centered
    ? emptyStateCenteredTop(height, imageHeight, hasAction)
    : emptyStateAnchorTop(height, imageHeight, titleFraction);

  return (
    <View style={[styles.anchor, { top }]} pointerEvents="box-none">
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
