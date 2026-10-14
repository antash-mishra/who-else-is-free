/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect -- Reanimated sheet transitions mutate shared values and mount state around animations. */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  Dimensions,
  Keyboard,
  KeyboardEvent,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';

import { useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, componentTokens, layout, radii, sheetMorph, shadows, spacing } from '@theme/index';
import { Springs } from '@theme/springs';
import { getKeyboardTranslation } from '@utils/bottomObstruction';

import SheetHeader from './SheetHeader';

export type BottomSheetPresentation = 'modal' | 'inline';
export type BottomSheetAnimation = 'spring' | 'timing';

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  avoidKeyboard?: boolean;
  snapHeight?: number;
  presentation?: BottomSheetPresentation;
  /** Retain an inline sheet's native layout while hidden. Never retains a native Modal. */
  keepMounted?: boolean;
  animation?: BottomSheetAnimation;
  testID?: string;
  backdropTestID?: string;
  closeTestID?: string;
  contentTestID?: string;
  contentStyle?: StyleProp<ViewStyle>;
  /** Fired after the entry animation has settled. */
  onOpened?: () => void;
  onClosed?: () => void;
  /**
   * Identifies the content shown. When it changes while the sheet is open and
   * settled (BottomSheetHost handing one sheet over to another), the old content
   * fades out, the new fades in, and the height glides between them.
   */
  contentKey?: string;
};

type SheetBody = {
  title?: string;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

type SheetMorph = {
  id: number;
  outgoing: SheetBody;
  /** The content key arriving by this morph; its layer mounts invisible. */
  incomingKey: string | undefined;
  /** Old body height, pinned with a plain style from the swap's first render. */
  fromHeight: number;
  /** New content's measured height; set once the glide starts. */
  toHeight?: number;
};

// Opacity layers driven by shared values on views React keeps mounted. Reanimated
// `exiting` animations hold views past React's removal, which is the pattern
// behind the Fabric "Attempt to recycle a mounted view" crash fixed in #208.
type MorphLayerProps = React.ComponentProps<typeof Animated.View> & { fadeIn: boolean };

/** The current content. Mounts invisible when it arrives by morph, then fades in. */
const MorphIncomingLayer = ({ fadeIn, style, ...rest }: MorphLayerProps) => {
  const opacity = useSharedValue(fadeIn ? 0 : 1);
  useEffect(() => {
    if (!fadeIn) return;
    opacity.value = withDelay(
      sheetMorph.fadeInDelayMs,
      withTiming(1, { duration: sheetMorph.fadeInMs, easing: Easing.out(Easing.cubic) }),
    );
    // Mount-only: a later prop change must not replay the fade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[style, fadeStyle]} {...rest} />;
};

/** The previous content, kept on top while it fades out, then removed by React. */
const MorphOutgoingLayer = ({ style, ...rest }: React.ComponentProps<typeof Animated.View>) => {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withTiming(0, {
      duration: sheetMorph.fadeOutMs,
      easing: Easing.in(Easing.cubic),
    });
  }, [opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[style, fadeStyle]} {...rest} />;
};

const BASE_PADDING_BOTTOM = 8;
const MIN_TOP_GUTTER = 96;
const MODAL_CLOSE_DURATION_MS = 300;
const INLINE_CLOSE_DURATION_MS = 220;
/**
 * keyboard-controller reports real IME frames from Android 11. Below it they are emulated
 * from window insets, which the app's adjustPan window never resizes, so older Android
 * keeps React Native's keyboard events.
 */
const MIN_ANDROID_API_FOR_KEYBOARD_FRAMES = 30;

const BottomSheet = ({
  visible,
  onClose,
  children,
  title,
  avoidKeyboard = true,
  snapHeight,
  presentation = 'modal',
  keepMounted = false,
  animation = presentation === 'modal' ? 'spring' : 'timing',
  testID = 'bottom-sheet-modal',
  backdropTestID = 'bottom-sheet-backdrop',
  closeTestID = 'bottom-sheet-close',
  contentTestID,
  contentStyle,
  onOpened,
  onClosed,
  contentKey,
}: BottomSheetProps) => {
  const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(visible);
  // Rasterize the sheet to a GPU texture only while it slides, so translating
  // heavy content (e.g. the cover grid) stays cheap; off otherwise so inner
  // scrolling is not re-rasterized every frame.
  const [isAnimating, setIsAnimating] = useState(false);
  const reduceMotion = useReducedMotion();
  // State, not a ref: render decides whether a content swap morphs, so the new
  // content can mount already invisible.
  const [isSettledJS, setIsSettledJS] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [shownContentKey, setShownContentKey] = useState(contentKey);
  const [morphSeq, setMorphSeq] = useState(0);
  const [morph, setMorph] = useState<SheetMorph | null>(null);
  const shownBodyRef = useRef<SheetBody | null>(null);
  const morphHeight = useSharedValue(0);
  // Latest size of the current content and the running morph, for the glide.
  const incomingMeasureRef = useRef<{ key: string | undefined; height: number } | null>(null);
  const activeMorphIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(visible);
  const hasBeenVisible = useRef(visible);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onClosedRef = useRef(onClosed);
  const onOpenedRef = useRef(onOpened);
  const shouldAnimateOnShowRef = useRef(false);
  const nativeModalShownRef = useRef(false);
  const visibleRef = useRef(visible);
  const presentationRef = useRef(presentation);
  const measuredSheetHeightRef = useRef(0);
  const slideY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);
  const keyboardOffset = useSharedValue(0);
  // Android (#190) follows the IME frame by frame: React Native's keyboardDidShow
  // arrives once, with duration 0, as soon as the IME is requested, so the sheet
  // used to snap to its final lift before the keyboard moved and the screen behind
  // showed through underneath. Frames only move a settled sheet: not while it enters
  // (a previous field's keyboard can still be sliding out) and not once it starts
  // closing (the close animation owns the offset). `latestKeyboardHeight` lets a
  // sheet catch up when it settles or starts avoiding the keyboard. A closing or
  // shrinking keyboard only ever lowers the sheet, so a sheet that settles while the
  // previous field's keyboard is still closing stays at rest.
  const followsKeyboardFrames =
    avoidKeyboard &&
    Platform.OS === 'android' &&
    Number(Platform.Version) >= MIN_ANDROID_API_FOR_KEYBOARD_FRAMES;
  const isSettled = useSharedValue(false);
  const latestKeyboardHeight = useSharedValue(0);
  const isKeyboardClosing = useSharedValue(false);
  const restingBottomInset = BASE_PADDING_BOTTOM + safeBottom;
  const topGutter = Math.max(safeTop + 12, MIN_TOP_GUTTER);
  const sheetMaxHeight = Math.max(screenHeight - topGutter, screenHeight * 0.5);
  const closeDuration =
    presentation === 'modal' ? MODAL_CLOSE_DURATION_MS : INLINE_CLOSE_DURATION_MS;
  const retainInline = presentation === 'inline' && keepMounted;

  const sheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: slideY.value - (avoidKeyboard ? keyboardOffset.value : 0) }],
      maxHeight: Math.max(0, sheetMaxHeight - (avoidKeyboard ? keyboardOffset.value : 0)),
    };
  });
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));
  // Keep the resting inset stable. On iOS only the home-indicator safe-area
  // portion sits behind the keyboard, preserving the intentional base spacing
  // between the final control and the keyboard.
  const keyboardContentStyle = { paddingBottom: restingBottomInset };

  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  useEffect(() => {
    onOpenedRef.current = onOpened;
  }, [onOpened]);

  const notifyOpened = useCallback(() => {
    setIsSettledJS(true);
    onOpenedRef.current?.();
  }, []);

  /** The lift for `keyboardHeight`, never above the current offset while the keyboard closes. */
  const liftForKeyboard = useCallback(
    (keyboardHeight: number) => {
      'worklet';

      // Inside the sheet's Modal window the height includes the navigation bar the
      // sheet already pads for (332dp reported, 284dp lift, 48dp inset on WEIF_API_36).
      const lift = getKeyboardTranslation({ keyboardHeight, safeAreaBottom: safeBottom });
      return isKeyboardClosing.value ? Math.min(keyboardOffset.value, lift) : lift;
    },
    [isKeyboardClosing, keyboardOffset, safeBottom],
  );

  const catchUpWithKeyboard = useCallback(() => {
    'worklet';

    keyboardOffset.value = withTiming(liftForKeyboard(latestKeyboardHeight.value), {
      duration: 160,
      easing: Easing.out(Easing.cubic),
    });
  }, [keyboardOffset, latestKeyboardHeight, liftForKeyboard]);

  const followKeyboardFrame = (height: number) => {
    'worklet';

    isKeyboardClosing.value = height < latestKeyboardHeight.value;
    latestKeyboardHeight.value = height;
    if (followsKeyboardFrames && isSettled.value) {
      keyboardOffset.value = liftForKeyboard(height);
    }
  };

  // The generic hook leaves the window's soft input mode alone; useKeyboardHandler
  // would switch the activity to adjustResize while any sheet is mounted.
  useGenericKeyboardHandler(
    {
      onMove: (event) => {
        'worklet';

        followKeyboardFrame(event.height);
      },
      onEnd: (event) => {
        'worklet';

        followKeyboardFrame(event.height);
      },
    },
    [followsKeyboardFrames, liftForKeyboard],
  );

  useEffect(() => {
    // BottomSheetHost swaps descriptors in place, so an open sheet can start avoiding
    // the keyboard without a new entry (More actions -> report prompt).
    if (followsKeyboardFrames && isSettled.value) {
      catchUpWithKeyboard();
    }
  }, [catchUpWithKeyboard, followsKeyboardFrames, isSettled]);

  useEffect(() => {
    if (!avoidKeyboard) {
      keyboardOffset.value = withTiming(0, {
        duration: 160,
        easing: Easing.out(Easing.cubic),
      });
      return undefined;
    }

    // Android 11+ follows the IME through useGenericKeyboardHandler above.
    if (followsKeyboardFrames) {
      return undefined;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const updateKeyboardOffset = (event: KeyboardEvent) => {
      const translation = getKeyboardTranslation({
        // Android reports `screenY` in physical-screen coordinates. With the
        // app configured for adjustPan, `useWindowDimensions()` can instead be
        // the already-panned window height, which makes the old subtraction
        // resolve to zero and leaves text-entry sheets under the keyboard.
        viewportHeight: Platform.OS === 'android' ? Dimensions.get('screen').height : undefined,
        keyboardTop: Platform.OS === 'android' ? event.endCoordinates.screenY : undefined,
        keyboardHeight: event.endCoordinates.height ?? 0,
        safeAreaBottom: safeBottom,
      });
      keyboardOffset.value = withTiming(translation, {
        duration: event.duration ?? 220,
        easing: Easing.out(Easing.cubic),
      });
    };
    const resetKeyboardOffset = (event?: KeyboardEvent) => {
      keyboardOffset.value = withTiming(0, {
        duration: event?.duration ?? 180,
        easing: Easing.out(Easing.cubic),
      });
    };
    const showSubscription = Keyboard.addListener(showEvent, updateKeyboardOffset);
    const hideSubscription = Keyboard.addListener(hideEvent, resetKeyboardOffset);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [avoidKeyboard, followsKeyboardFrames, keyboardOffset, safeBottom]);

  const startOpenAnimation = useCallback(() => {
    // Prepared sheets have already laid out. Start just below the viewport, not
    // an entire screen below it: that dead travel delays the first visible row.
    slideY.value =
      retainInline && measuredSheetHeightRef.current > 0
        ? measuredSheetHeightRef.current
        : screenHeight;
    backdropOpacity.value = 0;
    // Entry can now begin while a previous field's keyboard is still sliding
    // out, so a stale offset from that keyboard would start the sheet visibly
    // displaced. Reset it here rather than relying on the keyboard being fully
    // down before the sheet mounts.
    keyboardOffset.value = 0;
    isSettled.value = false;
    setIsSettledJS(false);
    setIsAnimating(true);
    const handleSettled = (finished?: boolean) => {
      'worklet';

      if (finished) {
        isSettled.value = true;
        if (followsKeyboardFrames) {
          // Catch up with a keyboard that opened, or finished closing, during entry.
          catchUpWithKeyboard();
        }
        runOnJS(setIsAnimating)(false);
        runOnJS(notifyOpened)();
      }
    };
    if (animation === 'spring') {
      slideY.value = withSpring(0, Springs.bouncyUp, handleSettled);
    } else {
      slideY.value = withTiming(
        0,
        {
          duration: 260,
          easing: Easing.out(Easing.cubic),
        },
        handleSettled,
      );
    }
    backdropOpacity.value = withTiming(1, {
      duration: animation === 'spring' ? 100 : 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [
    animation,
    backdropOpacity,
    catchUpWithKeyboard,
    followsKeyboardFrames,
    isSettled,
    keyboardOffset,
    notifyOpened,
    retainInline,
    screenHeight,
    slideY,
  ]);

  const startCloseAnimation = useCallback(() => {
    Keyboard.dismiss();
    setIsAnimating(true);
    isSettled.value = false;
    setIsSettledJS(false);
    keyboardOffset.value = withTiming(0, {
      duration: Math.min(180, closeDuration),
      easing: Easing.out(Easing.cubic),
    });
    slideY.value = withTiming(screenHeight, {
      duration: closeDuration,
      easing: Easing.in(Easing.cubic),
    });
    backdropOpacity.value = withTiming(0, {
      duration: Math.min(200, closeDuration),
      easing: Easing.in(Easing.ease),
    });
  }, [backdropOpacity, closeDuration, isSettled, keyboardOffset, screenHeight, slideY]);

  // Layout/keyboard changes update the geometry without replaying entry motion.
  const animationCallbacksRef = useRef({ startOpenAnimation, startCloseAnimation });
  useLayoutEffect(() => {
    animationCallbacksRef.current = { startOpenAnimation, startCloseAnimation };
  }, [startOpenAnimation, startCloseAnimation]);

  useLayoutEffect(() => {
    visibleRef.current = visible;
    if (presentationRef.current !== presentation) {
      // A different native window must report its own onShow before entry starts.
      presentationRef.current = presentation;
      nativeModalShownRef.current = false;
      shouldAnimateOnShowRef.current = false;
    }
    let frame: number | undefined;
    if (visible) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      hasBeenVisible.current = true;
      isMountedRef.current = true;
      setIsMounted(true);
      if (presentation === 'modal' && !nativeModalShownRef.current) {
        shouldAnimateOnShowRef.current = true;
      } else {
        if (retainInline) {
          // Prepared content already has native geometry; do not spend another frame waiting.
          animationCallbacksRef.current.startOpenAnimation();
        } else {
          frame = requestAnimationFrame(() => animationCallbacksRef.current.startOpenAnimation());
        }
      }
    } else if (hasBeenVisible.current && isMountedRef.current) {
      shouldAnimateOnShowRef.current = false;
      animationCallbacksRef.current.startCloseAnimation();
      closeTimerRef.current = setTimeout(() => {
        isMountedRef.current = false;
        nativeModalShownRef.current = false;
        setIsMounted(false);
        setIsAnimating(false);
        closeTimerRef.current = null;
        onClosedRef.current?.();
      }, closeDuration);
    }
    return () => {
      if (frame !== undefined) globalThis.cancelAnimationFrame(frame);
    };
  }, [closeDuration, presentation, retainInline, visible]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleModalShow = useCallback(() => {
    nativeModalShownRef.current = true;
    if (!visibleRef.current || !shouldAnimateOnShowRef.current) return;
    shouldAnimateOnShowRef.current = false;
    animationCallbacksRef.current.startOpenAnimation();
  }, []);

  const body: SheetBody = { title, children, contentStyle };
  if (contentKey !== shownContentKey) {
    // Decided in the swap's own render, so its first committed frame already pins
    // the old height (a plain style React applies at once) and shows the old content
    // on top. Pinning one update later let a frame at the new height reach screen.
    setShownContentKey(contentKey);
    // Snapshot of what this sheet last showed, taken at the moment of the swap.
    // eslint-disable-next-line react-hooks/refs
    const previous = shownBodyRef.current;
    const willMorph =
      visible && isSettledJS && bodyHeight > 0 && !reduceMotion && !snapHeight && previous;
    const id = morphSeq + 1;
    setMorphSeq(id);
    setMorph(
      willMorph && previous
        ? { id, outgoing: previous, incomingKey: contentKey, fromHeight: bodyHeight }
        : null,
    );
  }

  // Remember what this commit showed, for the next swap's outgoing layer.
  useLayoutEffect(() => {
    shownBodyRef.current = body;
  });

  const endMorph = useCallback((id: number, finalHeight?: number) => {
    setMorph((current) => (current?.id === id ? null : current));
    // The released body keeps this height, so layout may not report it again.
    if (finalHeight !== undefined && finalHeight > 0) setBodyHeight(finalHeight);
  }, []);

  const startGlide = useCallback(
    (id: number, toHeight: number) => {
      setMorph((current) => {
        if (current?.id !== id || current.toHeight !== undefined) return current;
        // The animated height attaches with the next render; start it at the pin.
        morphHeight.value = current.fromHeight;
        return { ...current, toHeight };
      });
    },
    [morphHeight],
  );

  const morphId = morph?.id;
  const morphTarget = morph?.toHeight;
  useEffect(() => {
    activeMorphIdRef.current = morphId ?? null;
    if (morphId === undefined) return undefined;
    // The new content may have been measured before this morph started; if so its
    // layout will not report again, so start the glide from that measurement.
    const measured = incomingMeasureRef.current;
    if (measured && measured.key === contentKey) startGlide(morphId, measured.height);
    // Safety net only; the height glide normally ends the morph.
    const timer = setTimeout(() => endMorph(morphId, measured?.height), sheetMorph.totalMs);
    return () => clearTimeout(timer);
    // contentKey is read for the measurement match only; a new key means a new morph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endMorph, morphId, startGlide]);

  useEffect(() => {
    if (morphId === undefined || morphTarget === undefined) return;
    const id = morphId;
    morphHeight.value = withTiming(
      morphTarget,
      { duration: sheetMorph.heightMs, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        'worklet';

        if (finished) runOnJS(endMorph)(id, morphTarget);
      },
    );
  }, [endMorph, morphHeight, morphId, morphTarget]);

  const morphHeightStyle = useAnimatedStyle(() => ({ height: morphHeight.value }));

  if (!isMounted && !retainInline) {
    return null;
  }

  const renderBody = (sheetBody: SheetBody, isOutgoing = false) => (
    <>
      {sheetBody.title !== undefined ? (
        <View style={styles.header}>
          <SheetHeader
            title={sheetBody.title}
            onClose={onClose}
            closeTestID={isOutgoing ? undefined : closeTestID}
          />
        </View>
      ) : null}
      <View
        style={[styles.content, snapHeight ? styles.contentFill : null, sheetBody.contentStyle]}
      >
        {sheetBody.children}
      </View>
    </>
  );

  const sheet = (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        pointerEvents="none"
      />
      {/* Tap-to-close layer is a sibling BEHIND the sheet card, not a wrapper.
          Touches that land on the sheet — including the whitespace between grid
          items — hit the card on top and never reach this Pressable, so they
          don't close the sheet AND nothing claims the JS responder on touch
          start, leaving an inner FlatList/ScrollView free to scroll from
          anywhere. A wrapping Pressable + onStartShouldSetResponder blocked that
          scroll at the JS bridge (same fix already applied in SheetRoutes.tsx). */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        testID={backdropTestID}
        accessibilityRole="button"
      />
      <Animated.View
        style={[
          styles.sheet,
          { maxHeight: sheetMaxHeight },
          snapHeight ? { height: snapHeight } : null,
          sheetStyle,
        ]}
        renderToHardwareTextureAndroid={isAnimating}
        testID={testID}
        onLayout={
          retainInline
            ? (event) => {
                measuredSheetHeightRef.current = event.nativeEvent.layout.height;
              }
            : undefined
        }
      >
        <Animated.View
          style={[
            styles.keyboardContent,
            keyboardContentStyle,
            snapHeight ? styles.contentFill : null,
          ]}
          testID={contentTestID}
        >
          <Animated.View
            style={[
              snapHeight ? styles.contentFill : styles.body,
              // While morphing: the plain pinned height holds from the first frame; the
              // animated height attaches over it once the glide starts. Both go when
              // the morph ends, handing height back to layout.
              morph ? [styles.bodyMorphing, { height: morph.fromHeight }] : null,
              morph?.toHeight !== undefined ? morphHeightStyle : null,
            ]}
            testID={`${testID}-body`}
            onLayout={
              morph
                ? undefined
                : (event) => {
                    const { height } = event.nativeEvent.layout;
                    if (height > 0 && height !== bodyHeight) setBodyHeight(height);
                  }
            }
          >
            <MorphIncomingLayer
              key={contentKey ?? 'content'}
              fadeIn={morph !== null && morph.incomingKey === contentKey}
              testID={`${testID}-body-content`}
              style={[
                snapHeight ? styles.contentFill : styles.bodyLayer,
                morph ? styles.bodyLayerNatural : null,
              ]}
              onLayout={(event) => {
                const { height } = event.nativeEvent.layout;
                incomingMeasureRef.current = { key: contentKey, height };
                const activeId = activeMorphIdRef.current;
                if (activeId !== null) startGlide(activeId, height);
              }}
            >
              {renderBody(body)}
            </MorphIncomingLayer>
            {morph ? (
              <MorphOutgoingLayer
                key={`outgoing-${morph.id}`}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.outgoingLayer}
              >
                {renderBody(morph.outgoing, true)}
              </MorphOutgoingLayer>
            ) : null}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );

  if (presentation === 'inline') {
    return (
      <View
        style={[StyleSheet.absoluteFill, !isMounted && styles.prepared]}
        pointerEvents={visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!isMounted}
        importantForAccessibility={isMounted ? 'auto' : 'no-hide-descendants'}
      >
        {sheet}
      </View>
    );
  }

  return (
    <Modal
      visible={isMounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={handleModalShow}
    >
      {sheet}
    </Modal>
  );
};

const styles = StyleSheet.create({
  prepared: { opacity: 0 },
  backdrop: {
    backgroundColor: componentTokens.overlay.backdrop,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: layout.sheetZIndex,
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    ...shadows.sheet,
    overflow: 'hidden',
  },
  keyboardContent: {
    flexShrink: 1,
  },
  content: {
    flexShrink: 1,
  },
  body: {
    flexShrink: 1,
  },
  bodyMorphing: {
    overflow: 'hidden',
  },
  bodyLayer: {
    flexShrink: 1,
  },
  /** While morphing the layer lays out at its natural height so it can be measured. */
  bodyLayerNatural: {
    flexShrink: 0,
  },
  outgoingLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  contentFill: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
});

export default BottomSheet;
