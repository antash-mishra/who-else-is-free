import { type ReactNode, useCallback, useEffect, useRef } from 'react';

import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { type StackScreenProps } from '@react-navigation/stack';

import { RootStackParamList } from '@navigation/types';
import EventDetailsScreen from '@screens/EventDetailsScreen';
import PendingRequestsScreen from '@screens/PendingRequestsScreen';
import { colors } from '@theme/colors';
import { radii } from '@theme/radii';

const ANDROID_CLOSE_FADE_MS = 160;

type SheetRouteChildren = ReactNode | ((controls: { onClose: () => void }) => ReactNode);

// How far the sheet background extends below the screen.
// When the spring overshoots (translateY goes negative), the card's bottom
// edge rises above the actual screen bottom, exposing a gap. Extending the
// sheet background by this amount fills that gap with white instead of
// revealing the underlying screen.
export const SHEET_BOUNCE_BUFFER = 80;

// Sheet modal wrapper.
// Backdrop and sheet are NON-OVERLAPPING siblings:
//   • Backdrop Pressable covers only the top 20% → tapping above sheet closes it
//   • Sheet View covers bottom 80% with explicit height → no touch interception
//     needed, so the inner ScrollView receives all gestures unimpeded.
// onStartShouldSetResponder is intentionally absent from the sheet — it would
// intercept touches at the JS bridge before the native UIScrollView can scroll.
export const SheetWrapper = ({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = screenHeight * 0.8;
  return (
    <View style={{ flex: 1 }} pointerEvents="box-none">
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: screenHeight - sheetHeight,
        }}
        onPress={onClose}
      />
      {/* Outer container extends SHEET_BOUNCE_BUFFER px below the screen so
          the bounce overshoot never exposes the underlying content. */}
      <View
        style={{
          position: 'absolute',
          bottom: -SHEET_BOUNCE_BUFFER,
          left: 0,
          right: 0,
          height: sheetHeight + SHEET_BOUNCE_BUFFER,
          backgroundColor: colors.background,
          borderTopLeftRadius: radii.sheet,
          borderTopRightRadius: radii.sheet,
          overflow: 'hidden',
        }}
      >
        <View style={{ height: sheetHeight }}>{children}</View>
      </View>
    </View>
  );
};

export const SheetRoute = ({
  children,
  onClose,
}: {
  children: SheetRouteChildren;
  onClose: () => void;
}) => {
  const opacity = useRef(new Animated.Value(1)).current;
  const hasRequestedClose = useRef(false);

  const requestClose = useCallback(() => {
    if (Platform.OS !== 'android') {
      onClose();
      return;
    }

    if (hasRequestedClose.current) {
      return;
    }
    hasRequestedClose.current = true;

    Animated.timing(opacity, {
      toValue: 0,
      duration: ANDROID_CLOSE_FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onClose();
      }
    });
  }, [onClose, opacity]);

  useEffect(() => {
    return () => {
      opacity.stopAnimation();
    };
  }, [opacity]);

  const content = typeof children === 'function' ? children({ onClose: requestClose }) : children;

  if (Platform.OS !== 'android') {
    return <SheetWrapper onClose={requestClose}>{content}</SheetWrapper>;
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
      transparent
      visible
    >
      <Animated.View style={[styles.androidSheetModalBackdrop, { opacity }]}>
        <SheetWrapper onClose={requestClose}>{content}</SheetWrapper>
      </Animated.View>
    </Modal>
  );
};

type EventDetailsOverlaySheetProps = StackScreenProps<RootStackParamList, 'EventDetailsOverlay'>;

export const EventDetailsOverlaySheet = ({ navigation }: EventDetailsOverlaySheetProps) => {
  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <SheetRoute onClose={handleClose}>
      {({ onClose }) => <EventDetailsScreen onOverlayClose={onClose} />}
    </SheetRoute>
  );
};

type PendingRequestsSheetProps = StackScreenProps<RootStackParamList, 'PendingRequests'>;

export const PendingRequestsSheet = ({ navigation }: PendingRequestsSheetProps) => {
  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <SheetRoute onClose={handleClose}>
      <PendingRequestsScreen />
    </SheetRoute>
  );
};

const styles = StyleSheet.create({
  androidSheetModalBackdrop: {
    flex: 1,
    backgroundColor: colors.navigationSheetBackdrop,
  },
});
