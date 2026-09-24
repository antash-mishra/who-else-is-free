/**
 * Guards patches/@react-navigation+stack+*.patch.
 *
 * @react-navigation/stack configures its back-swipe pan with the gesture-handler
 * v1 props `minOffsetX`/`maxDeltaY`. Gesture-handler v2 silently drops those, so
 * the pan fell back to activating after touch slop in any direction: on Android a
 * vertical drag that reached it claimed the touch and cancelled the page
 * ScrollView. The patch maps them to `activeOffsetX`/`failOffsetY`. If a
 * dependency upgrade drops the patch, these expectations fail.
 */
import { EVENT_DETAILS_BACK_EDGE_WIDTH } from '../transitions';

const { gestureActivationCriteria } = jest.requireActual(
  '../../../node_modules/@react-navigation/stack/lib/module/utils/gestureActivationCriteria',
);

const layout = { width: 400, height: 800 };

describe('stack back gesture activation criteria', () => {
  it('activates the horizontal back swipe only for rightward drags and fails on vertical ones', () => {
    const criteria = gestureActivationCriteria({
      direction: 'ltr',
      gestureDirection: 'horizontal',
      gestureResponseDistance: EVENT_DETAILS_BACK_EDGE_WIDTH,
      layout,
    });

    expect(criteria).toMatchObject({
      activeOffsetX: 5,
      failOffsetY: [-20, 20],
      hitSlop: { right: -layout.width + EVENT_DETAILS_BACK_EDGE_WIDTH },
    });
    expect(criteria).not.toHaveProperty('minOffsetX');
    expect(criteria).not.toHaveProperty('maxDeltaY');
  });

  it('uses gesture-handler v2 props for vertical stack gestures too', () => {
    const criteria = gestureActivationCriteria({
      direction: 'ltr',
      gestureDirection: 'vertical',
      layout,
    });

    expect(criteria).toMatchObject({ activeOffsetY: 5, failOffsetX: [-15, 15] });
    expect(criteria).not.toHaveProperty('minOffsetY');
    expect(criteria).not.toHaveProperty('maxDeltaX');
  });
});
