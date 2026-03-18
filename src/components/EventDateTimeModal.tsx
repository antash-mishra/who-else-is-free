import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

import { Feather } from "@expo/vector-icons";

import {
    clampDateTime,
    formatDateTimeValue,
    getSectionDateLabel,
    toDateKey,
} from "@utils/dateTime";
import styles from "./EventDateTimeModal.styles";

const SLIDE_DURATION = 250;
const SLIDE_DISTANCE = Dimensions.get('window').height;
const WHEEL_ITEM_HEIGHT = 44;

const HOURS = Array.from({ length: 24 }, (_value, index) =>
    String(index).padStart(2, "0"),
);
const MINUTES = Array.from({ length: 60 }, (_value, index) =>
    String(index).padStart(2, "0"),
);

type EventDateTimeModalProps = {
    visible: boolean;
    value: Date;
    minDate: Date;
    maxDate: Date;
    onClose: () => void;
    onConfirm: (value: Date) => void;
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
    const start = new Date(
        minDate.getFullYear(),
        minDate.getMonth(),
        minDate.getDate(),
    );
    const end = new Date(
        maxDate.getFullYear(),
        maxDate.getMonth(),
        maxDate.getDate(),
    );

    const options: DateWheelOption[] = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
        const key = toDateKey(cursor);
        options.push({
            key,
            label: getSectionDateLabel(key),
            year: cursor.getFullYear(),
            month: cursor.getMonth(),
            day: cursor.getDate(),
        });
        cursor.setDate(cursor.getDate() + 1);
    }

    return options;
};

const clampWheelIndex = (offsetY: number, length: number): number => {
    if (length <= 0) {
        return 0;
    }
    const rounded = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
    return Math.max(0, Math.min(length - 1, rounded));
};

const EventDateTimeModal = ({
    visible,
    value,
    minDate,
    maxDate,
    onClose,
    onConfirm,
}: EventDateTimeModalProps) => {
    const [draftValue, setDraftValue] = useState(() =>
        clampDateTime(toSafeDate(value), minDate, maxDate),
    );
    const slideAnim = useRef(new Animated.Value(SLIDE_DISTANCE)).current;
    const dateWheelRef = useRef<ScrollView>(null);
    const hourWheelRef = useRef<ScrollView>(null);
    const minuteWheelRef = useRef<ScrollView>(null);

    const dateOptions = useMemo(
        () => buildDateOptions(minDate, maxDate),
        [maxDate, minDate],
    );

    const selectedDateIndex = useMemo(() => {
        const selectedKey = toDateKey(draftValue);
        const index = dateOptions.findIndex((option) => option.key === selectedKey);
        return index >= 0 ? index : 0;
    }, [dateOptions, draftValue]);

    const selectedHourIndex = draftValue.getHours();
    const selectedMinuteIndex = draftValue.getMinutes();

    const scrollWheelToIndex = useCallback(
        (ref: RefObject<ScrollView | null>, index: number, animated = false) => {
            ref.current?.scrollTo({
                y: index * WHEEL_ITEM_HEIGHT,
                animated,
            });
        },
        [],
    );

    const syncWheelPositions = useCallback(
        (date: Date, animated = false) => {
            const key = toDateKey(date);
            const dateIndex = dateOptions.findIndex((option) => option.key === key);
            scrollWheelToIndex(dateWheelRef, dateIndex >= 0 ? dateIndex : 0, animated);
            scrollWheelToIndex(hourWheelRef, date.getHours(), animated);
            scrollWheelToIndex(minuteWheelRef, date.getMinutes(), animated);
        },
        [dateOptions, scrollWheelToIndex],
    );

    useEffect(() => {
        if (!visible) {
            return;
        }

        slideAnim.setValue(SLIDE_DISTANCE);
        Animated.timing(slideAnim, {
            toValue: 0,
            duration: SLIDE_DURATION,
            useNativeDriver: true,
        }).start();

        const initialDraft = clampDateTime(toSafeDate(value), minDate, maxDate);
        setDraftValue(initialDraft);
        requestAnimationFrame(() => {
            syncWheelPositions(initialDraft, false);
        });
    }, [maxDate, minDate, slideAnim, syncWheelPositions, value, visible]);

    const applyDateIndex = useCallback(
        (index: number) => {
            const option = dateOptions[index];
            if (!option) {
                return;
            }

            setDraftValue((previous) => {
                const next = new Date(previous);
                next.setFullYear(option.year, option.month, option.day);
                next.setSeconds(0, 0);
                const clamped = clampDateTime(next, minDate, maxDate);
                return clamped.getTime() === previous.getTime() ? previous : clamped;
            });
        },
        [dateOptions, maxDate, minDate],
    );

    const applyHourIndex = useCallback(
        (index: number) => {
            setDraftValue((previous) => {
                const next = new Date(previous);
                next.setHours(index, previous.getMinutes(), 0, 0);
                const clamped = clampDateTime(next, minDate, maxDate);
                return clamped.getTime() === previous.getTime() ? previous : clamped;
            });
        },
        [maxDate, minDate],
    );

    const applyMinuteIndex = useCallback(
        (index: number) => {
            setDraftValue((previous) => {
                const next = new Date(previous);
                next.setHours(previous.getHours(), index, 0, 0);
                const clamped = clampDateTime(next, minDate, maxDate);
                return clamped.getTime() === previous.getTime() ? previous : clamped;
            });
        },
        [maxDate, minDate],
    );

    const slideOut = useCallback(
        (callback: () => void) => {
            Animated.timing(slideAnim, {
                toValue: SLIDE_DISTANCE,
                duration: SLIDE_DURATION,
                useNativeDriver: true,
            }).start(() => {
                callback();
            });
        },
        [slideAnim],
    );

    const handleClose = useCallback(() => {
        slideOut(onClose);
    }, [onClose, slideOut]);

    const handleConfirm = useCallback(() => {
        slideOut(() => onConfirm(draftValue));
    }, [draftValue, onConfirm, slideOut]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <Pressable style={styles.backdrop} onPress={handleClose}>
                <Animated.View
                    style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
                >
                    <Pressable onPress={(event) => event.stopPropagation()}>
                        <View style={styles.header}>
                            <Text style={styles.title}>When is your event?</Text>
                            <Pressable style={styles.closeButton} onPress={handleClose}>
                                <Feather name="x" size={18} color="#999999" />
                            </Pressable>
                        </View>

                        <Text style={styles.selectedValue}>
                            {formatDateTimeValue(draftValue)}
                        </Text>

                        <View style={styles.pickerContainer}>
                            <View style={styles.wheelRow}>
                                <View style={[styles.wheelColumn, styles.dateWheelColumn]}>
                                    <ScrollView
                                        ref={dateWheelRef}
                                        showsVerticalScrollIndicator={false}
                                        snapToInterval={WHEEL_ITEM_HEIGHT}
                                        disableIntervalMomentum
                                        decelerationRate="fast"
                                        scrollEventThrottle={16}
                                        contentContainerStyle={styles.wheelContentContainer}
                                        onScroll={(event) => {
                                            const index = clampWheelIndex(
                                                event.nativeEvent.contentOffset.y,
                                                dateOptions.length,
                                            );
                                            applyDateIndex(index);
                                        }}
                                        onMomentumScrollEnd={(event) => {
                                            const index = clampWheelIndex(
                                                event.nativeEvent.contentOffset.y,
                                                dateOptions.length,
                                            );
                                            applyDateIndex(index);
                                            scrollWheelToIndex(dateWheelRef, index, false);
                                        }}
                                    >
                                        {dateOptions.map((option, index) => (
                                            <Pressable
                                                key={option.key}
                                                style={styles.wheelItem}
                                                onPress={() => {
                                                    applyDateIndex(index);
                                                    scrollWheelToIndex(dateWheelRef, index, true);
                                                }}
                                            >
                                                <Text
                                                    style={[
                                                        styles.wheelText,
                                                        styles.dateWheelText,
                                                        index === selectedDateIndex &&
                                                            styles.wheelTextSelected,
                                                    ]}
                                                >
                                                    {option.label}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                </View>

                                <View style={[styles.wheelColumn, styles.timeWheelColumn]}>
                                    <ScrollView
                                        ref={hourWheelRef}
                                        showsVerticalScrollIndicator={false}
                                        snapToInterval={WHEEL_ITEM_HEIGHT}
                                        disableIntervalMomentum
                                        decelerationRate="fast"
                                        scrollEventThrottle={16}
                                        contentContainerStyle={styles.wheelContentContainer}
                                        onScroll={(event) => {
                                            const index = clampWheelIndex(
                                                event.nativeEvent.contentOffset.y,
                                                HOURS.length,
                                            );
                                            applyHourIndex(index);
                                        }}
                                        onMomentumScrollEnd={(event) => {
                                            const index = clampWheelIndex(
                                                event.nativeEvent.contentOffset.y,
                                                HOURS.length,
                                            );
                                            applyHourIndex(index);
                                            scrollWheelToIndex(hourWheelRef, index, false);
                                        }}
                                    >
                                        {HOURS.map((hour, index) => (
                                            <Pressable
                                                key={`hour-${hour}`}
                                                style={styles.wheelItem}
                                                onPress={() => {
                                                    applyHourIndex(index);
                                                    scrollWheelToIndex(hourWheelRef, index, true);
                                                }}
                                            >
                                                <Text
                                                    style={[
                                                        styles.wheelText,
                                                        index === selectedHourIndex &&
                                                            styles.wheelTextSelected,
                                                    ]}
                                                >
                                                    {hour}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                </View>

                                <Text style={styles.timeSeparator}>:</Text>

                                <View style={[styles.wheelColumn, styles.timeWheelColumn]}>
                                    <ScrollView
                                        ref={minuteWheelRef}
                                        showsVerticalScrollIndicator={false}
                                        snapToInterval={WHEEL_ITEM_HEIGHT}
                                        disableIntervalMomentum
                                        decelerationRate="fast"
                                        scrollEventThrottle={16}
                                        contentContainerStyle={styles.wheelContentContainer}
                                        onScroll={(event) => {
                                            const index = clampWheelIndex(
                                                event.nativeEvent.contentOffset.y,
                                                MINUTES.length,
                                            );
                                            applyMinuteIndex(index);
                                        }}
                                        onMomentumScrollEnd={(event) => {
                                            const index = clampWheelIndex(
                                                event.nativeEvent.contentOffset.y,
                                                MINUTES.length,
                                            );
                                            applyMinuteIndex(index);
                                            scrollWheelToIndex(minuteWheelRef, index, false);
                                        }}
                                    >
                                        {MINUTES.map((minute, index) => (
                                            <Pressable
                                                key={`minute-${minute}`}
                                                style={styles.wheelItem}
                                                onPress={() => {
                                                    applyMinuteIndex(index);
                                                    scrollWheelToIndex(minuteWheelRef, index, true);
                                                }}
                                            >
                                                <Text
                                                    style={[
                                                        styles.wheelText,
                                                        index === selectedMinuteIndex &&
                                                            styles.wheelTextSelected,
                                                    ]}
                                                >
                                                    {minute}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                </View>
                            </View>

                            <View pointerEvents="none" style={styles.selectionOverlay} />
                        </View>

                        <Pressable style={styles.confirmButton} onPress={handleConfirm}>
                            <Text style={styles.confirmButtonText}>Update Time</Text>
                        </Pressable>
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
};

export default EventDateTimeModal;
