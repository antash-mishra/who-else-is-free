import {
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { triggerHaptic } from '@services/haptics';
import { colors, typography } from '@theme/index';
import {
  clampDateTime,
  getPickerSectionDateLabel,
  isPastDateTimeSelection,
  toDateKey,
} from '@utils/dateTime';

import BottomSheetModal from './BottomSheetModal';
import styles from './EventDateTimeModal.styles';

const WHEEL_ITEM_HEIGHT = 44;
const DRAG_END_SETTLE_DELAY_MS = 16;

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1)); // ["1".."12"]
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')); // ["00".."59"]
const AMPM = ['AM', 'PM'];

// Looped arrays: original repeated 3× so user has one buffer copy above and below
const HOURS_LOOPED = [...HOURS_12, ...HOURS_12, ...HOURS_12];
const MINUTES_LOOPED = [...MINUTES, ...MINUTES, ...MINUTES];
const HOUR_LOOP_OFFSET = HOURS_12.length; // 12 — start index of the middle copy
const MINUTE_LOOP_OFFSET = MINUTES.length; // 60 — start index of the middle copy
const HOUR_SNAP_OFFSETS = HOURS_LOOPED.map((_, index) => index * WHEEL_ITEM_HEIGHT);
const MINUTE_SNAP_OFFSETS = MINUTES_LOOPED.map((_, index) => index * WHEEL_ITEM_HEIGHT);
const AMPM_SNAP_OFFSETS = AMPM.map((_, index) => index * WHEEL_ITEM_HEIGHT);

export type EventDateTimeModalProps = {
  visible: boolean;
  value: Date;
  minDate: Date;
  maxDate: Date;
  onClose: () => void;
  onConfirm: (value: Date) => void;
};

type EventDateTimePickerContentProps = Omit<EventDateTimeModalProps, 'onClose'> & {
  /** Reset retained native offsets while hidden; ordinary modal exit keeps its draft. */
  prepareWhileHidden?: boolean;
};

const toSafeDate = (value: Date) => {
  if (Number.isNaN(value.getTime())) {
    return new Date();
  }
  return value;
};

type DateWheelOption = {
  key: string;
  label: string;
  year: number;
  month: number;
  day: number;
};

const buildDateOptions = (minDate: Date, maxDate: Date): DateWheelOption[] => {
  const start = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
  const options: DateWheelOption[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = toDateKey(cursor);
    options.push({
      key,
      label: getPickerSectionDateLabel(key),
      year: cursor.getFullYear(),
      month: cursor.getMonth(),
      day: cursor.getDate(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return options;
};

const clampWheelIndex = (offsetY: number, length: number): number => {
  if (length <= 0) return 0;
  const rounded = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
  return Math.max(0, Math.min(length - 1, rounded));
};

/** Convert 24-hour value to logical 12-hour index (0 = "1", 11 = "12") */
const hour24ToIndex = (hour24: number): number => {
  const hour12 = hour24 % 12;
  return hour12 === 0 ? 11 : hour12 - 1;
};

/** Convert 12-hour logical index + AM/PM index to 24-hour value */
const indexToHour24 = (hourIndex: number, amPmIndex: number): number => {
  const hourLabel = hourIndex + 1; // 1-12
  if (amPmIndex === 0) {
    return hourLabel === 12 ? 0 : hourLabel;
  }
  return hourLabel === 12 ? 12 : hourLabel + 12;
};

export const EventDateTimePickerContent = ({
  visible,
  value,
  minDate,
  maxDate,
  onConfirm,
  prepareWhileHidden = false,
}: EventDateTimePickerContentProps) => {
  const [draftValue, setDraftValue] = useState(() =>
    clampDateTime(toSafeDate(value), minDate, maxDate),
  );
  const [error, setError] = useState<string | null>(null);

  const visibleRef = useRef(visible);
  useLayoutEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const dateWheelRef = useRef<FlatList<string>>(null);
  const hourWheelRef = useRef<FlatList<string>>(null);
  const minuteWheelRef = useRef<FlatList<string>>(null);
  const amPmWheelRef = useRef<ScrollView>(null);
  const wheelMomentumStateRef = useRef<Record<string, boolean>>({});
  const wheelDragSettleTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>(
    {},
  );
  const wheelOffsetRef = useRef<Record<string, number>>({});
  const wheelUserDragRef = useRef<Record<string, boolean>>({});

  // Time-of-day bounds refresh on opening, but labels and rows only change by calendar day.
  const minDay = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime();
  const maxDay = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()).getTime();
  const dateOptions = useMemo(
    () => buildDateOptions(new Date(minDay), new Date(maxDay)),
    [minDay, maxDay],
  );
  const dateLabels = useMemo(() => dateOptions.map((option) => option.label), [dateOptions]);

  const selectedDateIndex = useMemo(() => {
    const key = toDateKey(draftValue);
    const index = dateOptions.findIndex((opt) => opt.key === key);
    return index >= 0 ? index : 0;
  }, [dateOptions, draftValue]);

  const dateSnapOffsets = useMemo(
    () => dateOptions.map((_, index) => index * WHEEL_ITEM_HEIGHT),
    [dateOptions],
  );

  // Logical indices (used for bold highlight — check against looped arrays with modulo)
  const selectedHourLogical = hour24ToIndex(draftValue.getHours());
  const selectedMinuteLogical = draftValue.getMinutes();
  const selectedAmPmIndex = draftValue.getHours() >= 12 ? 1 : 0;

  const scrollWheelToIndex = useCallback(
    (ref: RefObject<ScrollView | FlatList<string> | null>, index: number, animated = false) => {
      const wheel = ref.current;
      if (wheel instanceof FlatList) {
        wheel.scrollToOffset({ offset: index * WHEEL_ITEM_HEIGHT, animated });
      } else {
        wheel?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated });
      }
    },
    [],
  );

  const cancelPendingWheelSettles = useCallback(() => {
    Object.values(wheelDragSettleTimeoutRef.current).forEach((timeout) => {
      if (timeout !== null) clearTimeout(timeout);
    });
    wheelDragSettleTimeoutRef.current = {};
    wheelMomentumStateRef.current = {};
    wheelOffsetRef.current = {};
    wheelUserDragRef.current = {};
  }, []);

  useEffect(() => {
    cancelPendingWheelSettles();
    if (!visible && !prepareWhileHidden) return;
    // A retained picker must discard unconfirmed edits and synchronize while hidden,
    // before its next entry, rather than reusing last session's native scroll position.
    const initialDraft = clampDateTime(toSafeDate(value), minDate, maxDate);
    setDraftValue((current) =>
      current.getTime() === initialDraft.getTime() ? current : initialDraft,
    );
    setError(null);
  }, [cancelPendingWheelSettles, maxDate, minDate, prepareWhileHidden, value, visible]);

  useEffect(() => cancelPendingWheelSettles, [cancelPendingWheelSettles]);

  useEffect(() => {
    if (visible || !prepareWhileHidden) return;
    scrollWheelToIndex(dateWheelRef, selectedDateIndex);
    scrollWheelToIndex(hourWheelRef, HOUR_LOOP_OFFSET + selectedHourLogical);
    scrollWheelToIndex(minuteWheelRef, MINUTE_LOOP_OFFSET + selectedMinuteLogical);
    scrollWheelToIndex(amPmWheelRef, selectedAmPmIndex);
  }, [
    prepareWhileHidden,
    scrollWheelToIndex,
    selectedAmPmIndex,
    selectedDateIndex,
    selectedHourLogical,
    selectedMinuteLogical,
    visible,
  ]);

  const applyDateIndex = useCallback(
    (index: number) => {
      const option = dateOptions[index];
      if (!option) return;
      setDraftValue((prev) => {
        const next = new Date(prev);
        next.setFullYear(option.year, option.month, option.day);
        next.setSeconds(0, 0);
        return next;
      });
    },
    [dateOptions],
  );

  const applyHourIndex = useCallback((logicalIndex: number) => {
    setDraftValue((prev) => {
      const hour24 = indexToHour24(logicalIndex, prev.getHours() >= 12 ? 1 : 0);
      const next = new Date(prev);
      next.setHours(hour24, prev.getMinutes(), 0, 0);
      return next;
    });
  }, []);

  const applyMinuteIndex = useCallback((logicalIndex: number) => {
    setDraftValue((prev) => {
      const next = new Date(prev);
      next.setHours(prev.getHours(), logicalIndex, 0, 0);
      return next;
    });
  }, []);

  const applyAmPmIndex = useCallback((index: number) => {
    setDraftValue((prev) => {
      const hour12 = prev.getHours() % 12;
      const hour24 = index === 0 ? hour12 : hour12 + 12;
      const next = new Date(prev);
      next.setHours(hour24, prev.getMinutes(), 0, 0);
      return next;
    });
  }, []);

  // Looped scroll handlers: extract logical index and apply.
  const handleHourScrollIndex = useCallback(
    (rawIndex: number) => {
      const logical = rawIndex % HOURS_12.length;
      applyHourIndex(logical);
    },
    [applyHourIndex],
  );

  const handleMinuteScrollIndex = useCallback(
    (rawIndex: number) => {
      const logical = rawIndex % MINUTES.length;
      applyMinuteIndex(logical);
    },
    [applyMinuteIndex],
  );

  const handleConfirm = useCallback(() => {
    if (isPastDateTimeSelection(draftValue)) {
      setError('Please choose a future time');
      return;
    }
    triggerHaptic('submit');
    setError(null);
    onConfirm(draftValue);
  }, [draftValue, onConfirm]);

  const renderWheel = useCallback(
    (
      ref: RefObject<ScrollView | FlatList<string> | null>,
      items: string[],
      snapOffsets: number[],
      isSelected: (index: number) => boolean,
      onScrollIndex: (index: number) => void,
      keyPrefix: string,
      // For looped columns: map any raw index to its middle-copy equivalent for press/snap
      toMiddleIndex?: (rawIndex: number) => number,
      initialOffset: number = 0,
    ) => {
      const clearDragSettleTimeout = () => {
        const timeout = wheelDragSettleTimeoutRef.current[keyPrefix];
        if (timeout) {
          clearTimeout(timeout);
          wheelDragSettleTimeoutRef.current[keyPrefix] = null;
        }
      };

      const settleWheelAtOffset = (offsetY: number, animateToSnap = false) => {
        if (!visibleRef.current) return;
        const index = clampWheelIndex(offsetY, items.length);
        const target = toMiddleIndex ? toMiddleIndex(index) : index;
        if (wheelUserDragRef.current[keyPrefix]) {
          triggerHaptic('selection');
          wheelUserDragRef.current[keyPrefix] = false;
        }
        onScrollIndex(index);
        const targetOffset = target * WHEEL_ITEM_HEIGHT;
        const needsSnapAlignment = Math.abs(offsetY - targetOffset) > 0.5;

        if (target !== index) {
          scrollWheelToIndex(ref, target, false);
        } else if (needsSnapAlignment) {
          scrollWheelToIndex(ref, target, animateToSnap);
        }
      };

      const renderItem = ({ item, index }: { item: string; index: number }) => (
        <Text
          key={`${keyPrefix}-${index}`}
          accessibilityRole="button"
          style={[
            styles.wheelItem,
            styles.wheelText,
            isSelected(index) && styles.wheelTextSelected,
          ]}
          onPress={() => {
            const target = toMiddleIndex ? toMiddleIndex(index) : index;
            onScrollIndex(target);
            scrollWheelToIndex(ref, target, true);
          }}
        >
          {item}
        </Text>
      );
      const scrollProps = {
        contentOffset: { x: 0, y: initialOffset },
        showsVerticalScrollIndicator: false,
        snapToOffsets: snapOffsets,
        decelerationRate: 'fast' as const,
        contentContainerStyle: styles.wheelContentContainer,
        onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          wheelOffsetRef.current[keyPrefix] = e.nativeEvent.contentOffset.y;
        },
        scrollEventThrottle: 16,
        onScrollBeginDrag: () => {
          clearDragSettleTimeout();
          wheelMomentumStateRef.current[keyPrefix] = false;
          wheelUserDragRef.current[keyPrefix] = true;
        },
        onMomentumScrollBegin: () => {
          clearDragSettleTimeout();
          wheelMomentumStateRef.current[keyPrefix] = true;
        },
        onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (!visibleRef.current) return;
          const y =
            e.nativeEvent.targetContentOffset?.y ??
            wheelOffsetRef.current[keyPrefix] ??
            e.nativeEvent.contentOffset.y;
          clearDragSettleTimeout();
          wheelDragSettleTimeoutRef.current[keyPrefix] = setTimeout(() => {
            if (wheelMomentumStateRef.current[keyPrefix]) {
              return;
            }
            settleWheelAtOffset(y, true);
            wheelDragSettleTimeoutRef.current[keyPrefix] = null;
          }, DRAG_END_SETTLE_DELAY_MS);
        },
        onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          wheelMomentumStateRef.current[keyPrefix] = false;
          clearDragSettleTimeout();
          settleWheelAtOffset(wheelOffsetRef.current[keyPrefix] ?? e.nativeEvent.contentOffset.y);
        },
      };
      if (keyPrefix !== 'ampm') {
        return (
          <FlatList
            ref={ref as RefObject<FlatList<string> | null>}
            {...scrollProps}
            data={items}
            renderItem={renderItem}
            keyExtractor={(_, index) => `${keyPrefix}-${index}`}
            // The viewport has two padded rows above the selected center row.
            // contentOffset positions selection; the initial window must include those rows too.
            initialScrollIndex={Math.max(0, Math.round(initialOffset / WHEEL_ITEM_HEIGHT) - 2)}
            getItemLayout={(_, index) => ({
              length: WHEEL_ITEM_HEIGHT,
              offset: index * WHEEL_ITEM_HEIGHT,
              index,
            })}
            initialNumToRender={7}
            maxToRenderPerBatch={7}
            windowSize={3}
            removeClippedSubviews={false}
          />
        );
      }
      return (
        <ScrollView ref={ref as RefObject<ScrollView | null>} {...scrollProps}>
          {items.map((item, index) => renderItem({ item, index }))}
        </ScrollView>
      );
    },
    [scrollWheelToIndex],
  );

  const pickerWheels = useMemo(
    () => (
      <View style={styles.pickerContainer}>
        {/* Selection indicator: two thin lines framing the centre row */}
        <View pointerEvents="none" style={styles.selectionIndicator}>
          <View style={styles.selectionLine} />
          <View style={styles.selectionSpacer} />
          <View style={styles.selectionLine} />
        </View>

        <View style={styles.wheelRow}>
          {/* Date column — bounded, no looping */}
          <View style={[styles.wheelColumn, styles.dateWheelColumn]}>
            {renderWheel(
              dateWheelRef,
              dateLabels,
              dateSnapOffsets,
              (i) => i === selectedDateIndex,
              applyDateIndex,
              'date',
              undefined,
              selectedDateIndex * WHEEL_ITEM_HEIGHT,
            )}
          </View>

          {/* Hour column — looped */}
          <View style={[styles.wheelColumn, styles.timeWheelColumn]}>
            {renderWheel(
              hourWheelRef,
              HOURS_LOOPED,
              HOUR_SNAP_OFFSETS,
              (i) => i % HOURS_12.length === selectedHourLogical,
              handleHourScrollIndex,
              'hour',
              (i) => HOUR_LOOP_OFFSET + (i % HOURS_12.length),
              (HOUR_LOOP_OFFSET + selectedHourLogical) * WHEEL_ITEM_HEIGHT,
            )}
          </View>

          {/* Separator */}
          <Text style={styles.timeSeparator}>:</Text>

          {/* Minute column — looped */}
          <View style={[styles.wheelColumn, styles.timeWheelColumn]}>
            {renderWheel(
              minuteWheelRef,
              MINUTES_LOOPED,
              MINUTE_SNAP_OFFSETS,
              (i) => i % MINUTES.length === selectedMinuteLogical,
              handleMinuteScrollIndex,
              'minute',
              (i) => MINUTE_LOOP_OFFSET + (i % MINUTES.length),
              (MINUTE_LOOP_OFFSET + selectedMinuteLogical) * WHEEL_ITEM_HEIGHT,
            )}
          </View>

          {/* AM/PM column — only 2 items, no looping needed */}
          <View style={[styles.wheelColumn, styles.amPmWheelColumn]}>
            {renderWheel(
              amPmWheelRef,
              AMPM,
              AMPM_SNAP_OFFSETS,
              (i) => i === selectedAmPmIndex,
              applyAmPmIndex,
              'ampm',
              undefined,
              selectedAmPmIndex * WHEEL_ITEM_HEIGHT,
            )}
          </View>
        </View>

        {/* Fade gradients — each covers 2 items above/below centre */}
        <LinearGradient
          colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0)']}
          style={styles.fadeTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,1)']}
          style={styles.fadeBottom}
          pointerEvents="none"
        />
      </View>
    ),
    [
      applyAmPmIndex,
      applyDateIndex,
      dateLabels,
      dateSnapOffsets,
      handleHourScrollIndex,
      handleMinuteScrollIndex,
      renderWheel,
      selectedAmPmIndex,
      selectedDateIndex,
      selectedHourLogical,
      selectedMinuteLogical,
    ],
  );

  return (
    <>
      {pickerWheels}

      {error ? <Text style={errorStyle.text}>{error}</Text> : null}
      <Pressable style={styles.confirmButton} onPress={handleConfirm}>
        <Text style={styles.confirmButtonText}>Done</Text>
      </Pressable>
    </>
  );
};

const EventDateTimeModal = ({ onClose, ...contentProps }: EventDateTimeModalProps) => {
  return (
    <BottomSheetModal visible={contentProps.visible} onClose={onClose} title="When is your event?">
      <EventDateTimePickerContent {...contentProps} />
    </BottomSheetModal>
  );
};

const errorStyle = StyleSheet.create({
  text: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    color: colors.error,
    marginBottom: 8,
  },
});

export default EventDateTimeModal;
