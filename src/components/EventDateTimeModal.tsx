import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Modal,
    Platform,
    Pressable,
    Text,
    View,
} from "react-native";

import DateTimePicker, {
    DateTimePickerAndroid,
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";

import {
    clampDateTime,
    formatAbsoluteDateLabel,
    formatDateTimeValue,
    formatTime,
    toDateKey,
} from "@utils/dateTime";
import styles from "./EventDateTimeModal.styles";

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

    useEffect(() => {
        if (!visible) {
            return;
        }

        setDraftValue(clampDateTime(toSafeDate(value), minDate, maxDate));
    }, [maxDate, minDate, value, visible]);

    const applyDatePart = useCallback(
        (nextDate: Date) => {
            setDraftValue((previous) => {
                const merged = new Date(previous);
                merged.setFullYear(
                    nextDate.getFullYear(),
                    nextDate.getMonth(),
                    nextDate.getDate(),
                );
                return clampDateTime(merged, minDate, maxDate);
            });
        },
        [maxDate, minDate],
    );

    const applyTimePart = useCallback(
        (nextTime: Date) => {
            setDraftValue((previous) => {
                const merged = new Date(previous);
                merged.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0);
                return clampDateTime(merged, minDate, maxDate);
            });
        },
        [maxDate, minDate],
    );

    const handleIOSChange = useCallback(
        (_event: DateTimePickerEvent, selectedDate?: Date) => {
            if (!selectedDate) {
                return;
            }

            setDraftValue(clampDateTime(selectedDate, minDate, maxDate));
        },
        [maxDate, minDate],
    );

    const handleAndroidDateOpen = useCallback(() => {
        DateTimePickerAndroid.open({
            value: draftValue,
            mode: "date",
            minimumDate: minDate,
            maximumDate: maxDate,
            onChange: (event, selectedDate) => {
                if (event.type !== "set" || !selectedDate) {
                    return;
                }
                applyDatePart(selectedDate);
            },
        });
    }, [applyDatePart, draftValue, maxDate, minDate]);

    const handleAndroidTimeOpen = useCallback(() => {
        DateTimePickerAndroid.open({
            value: draftValue,
            mode: "time",
            is24Hour: true,
            onChange: (event, selectedDate) => {
                if (event.type !== "set" || !selectedDate) {
                    return;
                }
                applyTimePart(selectedDate);
            },
        });
    }, [applyTimePart, draftValue]);

    const androidDateValue = useMemo(() => {
        const key = toDateKey(draftValue);
        return formatAbsoluteDateLabel(key);
    }, [draftValue]);

    const androidTimeValue = useMemo(
        () => formatTime(draftValue.getHours(), draftValue.getMinutes()),
        [draftValue],
    );

    const handleConfirm = useCallback(() => {
        onConfirm(draftValue);
    }, [draftValue, onConfirm]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable onPress={(event) => event.stopPropagation()}>
                    <View style={styles.container}>
                        <View style={styles.header}>
                            <Text style={styles.title}>When is your event?</Text>
                            <Pressable style={styles.closeButton} onPress={onClose}>
                                <Feather name="x" size={20} color="#FFFFFF" />
                            </Pressable>
                        </View>

                        <Text style={styles.selectedValue}>
                            {formatDateTimeValue(draftValue)}
                        </Text>

                        {Platform.OS === "ios" ? (
                            <DateTimePicker
                                value={draftValue}
                                mode="datetime"
                                display="spinner"
                                textColor="#FFFFFF"
                                minimumDate={minDate}
                                maximumDate={maxDate}
                                minuteInterval={5}
                                onChange={handleIOSChange}
                                style={styles.iosPicker}
                            />
                        ) : (
                            <View style={styles.androidActions}>
                                <View style={styles.androidActionRow}>
                                    <View>
                                        <Text style={styles.androidActionLabel}>Date</Text>
                                        <Text style={styles.androidActionValue}>
                                            {androidDateValue}
                                        </Text>
                                    </View>
                                    <Pressable
                                        style={styles.androidActionButton}
                                        onPress={handleAndroidDateOpen}
                                    >
                                        <Text style={styles.androidActionButtonText}>Change</Text>
                                    </Pressable>
                                </View>
                                <View style={styles.androidActionRow}>
                                    <View>
                                        <Text style={styles.androidActionLabel}>Time</Text>
                                        <Text style={styles.androidActionValue}>
                                            {androidTimeValue}
                                        </Text>
                                    </View>
                                    <Pressable
                                        style={styles.androidActionButton}
                                        onPress={handleAndroidTimeOpen}
                                    >
                                        <Text style={styles.androidActionButtonText}>Change</Text>
                                    </Pressable>
                                </View>
                            </View>
                        )}

                        <Pressable style={styles.confirmButton} onPress={handleConfirm}>
                            <Text style={styles.confirmButtonText}>Update Time</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

export default EventDateTimeModal;
