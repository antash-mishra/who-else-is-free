import { type ReactNode } from 'react';

import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { type StackScreenProps } from '@react-navigation/stack';

import { RootStackParamList } from '@navigation/types';
import EventDetailsScreen from '@screens/EventDetailsScreen';
import PendingRequestsScreen from '@screens/PendingRequestsScreen';
import { colors } from '@theme/colors';
import { radii } from '@theme/radii';

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

export const AndroidSheetRoute = ({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) => {
  if (Platform.OS !== 'android') {
    return <SheetWrapper onClose={onClose}>{children}</SheetWrapper>;
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={styles.androidSheetModalBackdrop}>
        <SheetWrapper onClose={onClose}>{children}</SheetWrapper>
      </View>
    </Modal>
  );
};

type EventDetailsOverlaySheetProps = StackScreenProps<RootStackParamList, 'EventDetailsOverlay'>;

export const EventDetailsOverlaySheet = ({ navigation }: EventDetailsOverlaySheetProps) => (
  <AndroidSheetRoute onClose={() => navigation.goBack()}>
    <EventDetailsScreen />
  </AndroidSheetRoute>
);

type PendingRequestsSheetProps = StackScreenProps<RootStackParamList, 'PendingRequests'>;

export const PendingRequestsSheet = ({ navigation }: PendingRequestsSheetProps) => (
  <AndroidSheetRoute onClose={() => navigation.goBack()}>
    <PendingRequestsScreen />
  </AndroidSheetRoute>
);

const styles = StyleSheet.create({
  androidSheetModalBackdrop: {
    flex: 1,
    backgroundColor: colors.navigationSheetBackdrop,
  },
});
