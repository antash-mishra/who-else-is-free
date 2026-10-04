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
  keepMounted?: boolean;
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
  prepare: (ownerId: string, descriptor: BottomSheetDescriptor) => void;
  release: (ownerId: string) => void;
};

const BottomSheetHostContext = createContext<BottomSheetHostContextValue | null>(null);

export const BottomSheetHostProvider = ({ children }: { children: ReactNode }) => {
  const [sheet, setSheet] = useState<HostedBottomSheet | null>(null);
  const [visible, setVisible] = useState(false);
  const [preparedSheets, setPreparedSheets] = useState<HostedBottomSheet[]>([]);
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

  const prepare = useCallback((ownerId: string, descriptor: BottomSheetDescriptor) => {
    if (descriptor.presentation !== 'inline' || !descriptor.keepMounted) return;
    setPreparedSheets((current) => {
      const previous = current.find((entry) => entry.ownerId === ownerId);
      if (previous?.descriptor === descriptor) return current;
      const next = { ownerId, descriptor };
      return previous
        ? current.map((entry) => (entry.ownerId === ownerId ? next : entry))
        : [...current, next];
    });
  }, []);

  const release = useCallback((ownerId: string) => {
    setPreparedSheets((current) => current.filter((entry) => entry.ownerId !== ownerId));
    if (sheetRef.current?.ownerId === ownerId && sheetRef.current.descriptor.keepMounted) {
      sheetRef.current = null;
      visibleRef.current = false;
      setSheet(null);
      setVisible(false);
    }
  }, []);

  const handleClosed = useCallback((ownerId: string) => {
    if (visibleRef.current || sheetRef.current?.ownerId !== ownerId) {
      return;
    }
    sheetRef.current = null;
    setSheet(null);
  }, []);

  const value = useMemo(
    () => ({ present, dismiss, prepare, release }),
    [dismiss, present, prepare, release],
  );
  const descriptor = sheet?.descriptor;
  const renderedSheets = [...preparedSheets];
  if (sheet && !preparedSheets.some((entry) => entry.ownerId === sheet.ownerId)) {
    renderedSheets.push(sheet);
  }

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
        {renderedSheets.map(({ ownerId, descriptor: renderedDescriptor }) => (
          <BottomSheet
            key={renderedDescriptor.keepMounted ? ownerId : 'active'}
            visible={visible && sheet?.ownerId === ownerId}
            presentation={renderedDescriptor.presentation}
            keepMounted={renderedDescriptor.keepMounted}
            animation="spring"
            onClose={renderedDescriptor.onClose}
            title={renderedDescriptor.title}
            avoidKeyboard={renderedDescriptor.avoidKeyboard}
            snapHeight={renderedDescriptor.snapHeight}
            testID={renderedDescriptor.testID}
            backdropTestID={renderedDescriptor.backdropTestID}
            closeTestID={renderedDescriptor.closeTestID}
            contentTestID={renderedDescriptor.contentTestID}
            contentStyle={renderedDescriptor.contentStyle}
            onOpened={renderedDescriptor.onOpened}
            onClosed={() => handleClosed(ownerId)}
          >
            {renderedDescriptor.children}
          </BottomSheet>
        ))}
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
