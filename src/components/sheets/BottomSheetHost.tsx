import React, {
  ReactNode,
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { BackHandler, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import BottomSheet, { BottomSheetPresentation } from './BottomSheet';

export type BottomSheetDescriptor = {
  children: ReactNode;
  presentation?: BottomSheetPresentation;
  title?: string;
  avoidKeyboard?: boolean;
  snapHeight?: number;
  testID?: string;
  backdropTestID?: string;
  closeTestID?: string;
  contentTestID?: string;
  contentStyle?: StyleProp<ViewStyle>;
  onOpened?: () => void;
  onClose: () => void;
};

type HostedBottomSheet = {
  ownerId: string;
  descriptor: BottomSheetDescriptor;
};

type BottomSheetHostContextValue = {
  present: (ownerId: string, descriptor: BottomSheetDescriptor) => void;
  dismiss: (ownerId: string) => void;
};

const BottomSheetHostContext = createContext<BottomSheetHostContextValue | null>(null);

export const BottomSheetHostProvider = ({ children }: { children: ReactNode }) => {
  const [sheet, setSheet] = useState<HostedBottomSheet | null>(null);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HostedBottomSheet | null>(null);
  const visibleRef = useRef(false);

  const present = useCallback((ownerId: string, descriptor: BottomSheetDescriptor) => {
    const nextSheet = { ownerId, descriptor };
    sheetRef.current = nextSheet;
    visibleRef.current = true;
    setSheet(nextSheet);
    setVisible(true);
  }, []);

  const dismiss = useCallback((ownerId: string) => {
    if (sheetRef.current?.ownerId !== ownerId) {
      return;
    }
    visibleRef.current = false;
    setVisible(false);
  }, []);

  const handleClosed = useCallback(() => {
    if (visibleRef.current) {
      return;
    }
    sheetRef.current = null;
    setSheet(null);
  }, []);

  const value = useMemo(() => ({ present, dismiss }), [dismiss, present]);
  const descriptor = sheet?.descriptor;

  const isInline = sheet !== null && descriptor?.presentation === 'inline';
  useEffect(() => {
    if (!isInline) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (visibleRef.current) sheetRef.current?.descriptor.onClose();
      // Consume back throughout exit so it cannot also pop the underlying route.
      return true;
    });
    return () => subscription.remove();
  }, [isInline]);

  return (
    <BottomSheetHostContext.Provider value={value}>
      <View style={styles.root}>
        <View
          style={styles.root}
          testID="bottom-sheet-host-content"
          pointerEvents={isInline ? 'none' : 'auto'}
          accessibilityElementsHidden={isInline}
          importantForAccessibility={isInline ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </View>
        {descriptor ? (
          <BottomSheet
            visible={visible}
            presentation={descriptor.presentation}
            animation="spring"
            onClose={descriptor.onClose}
            title={descriptor.title}
            avoidKeyboard={descriptor.avoidKeyboard}
            snapHeight={descriptor.snapHeight}
            testID={descriptor.testID}
            backdropTestID={descriptor.backdropTestID}
            closeTestID={descriptor.closeTestID}
            contentTestID={descriptor.contentTestID}
            contentStyle={descriptor.contentStyle}
            onOpened={descriptor.onOpened}
            onClosed={handleClosed}
          >
            {descriptor.children}
          </BottomSheet>
        ) : null}
      </View>
    </BottomSheetHostContext.Provider>
  );
};

export const useBottomSheetHost = () => {
  const context = useContext(BottomSheetHostContext);
  if (!context) {
    throw new Error('useBottomSheetHost must be used within a BottomSheetHostProvider');
  }

  return context;
};

export const useOptionalBottomSheetHost = () => useContext(BottomSheetHostContext);

const styles = StyleSheet.create({ root: { flex: 1 } });
