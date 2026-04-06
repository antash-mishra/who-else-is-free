import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";

import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { clampDateTime } from "@utils/dateTime";
import BottomSheetModal from "./BottomSheetModal";
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

    // Sync draft to the incoming value each time the modal opens
    useEffect(() => {
        if (visible) {
            setDraftValue(clampDateTime(toSafeDate(value), minDate, maxDate));
        }
    }, [visible, value, minDate, maxDate]);

    const handleChange = (_event: DateTimePickerEvent, date?: Date) => {
        if (date) {
            setDraftValue(date);
        }
    };

    return (
        <BottomSheetModal visible={visible} onClose={onClose} title="When is your event?">
            <DateTimePicker
                value={draftValue}
                mode="datetime"
                display="spinner"
                minimumDate={minDate}
                maximumDate={maxDate}
                onChange={handleChange}
            />
            <Pressable style={styles.confirmButton} onPress={() => onConfirm(draftValue)}>
                <Text style={styles.confirmButtonText}>Update Time</Text>
            </Pressable>
        </BottomSheetModal>
    );
};

export default EventDateTimeModal;
