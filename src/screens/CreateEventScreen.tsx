import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FlatList,
    Image,
    ScrollView,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
    CompositeNavigationProp,
    RouteProp,
    useFocusEffect,
    useNavigation,
    useRoute,
} from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList, RootTabParamList } from "@navigation/types";
import { colors, spacing, typography } from "@theme/index";
import { GuestEventDraft, UserEvent, useEvents } from "@context/EventsContext";
import { useAuth } from "@context/AuthContext";
import {
    COVER_OPTIONS,
    CoverKey,
    DEFAULT_COVER_KEY,
    resolveCoverUri,
} from "@constants/covers";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

const AGE_MIN = 18;
const AGE_MAX = 60;

const groupOptions = ["Single", "Group"] as const;
const genderOptions = ["Any", "Female", "Male"] as const;
const baseTimeOptions = [
    "7:00pm",
    "7:30pm",
    "8:00pm",
    "8:30pm",
    "9:00pm",
    "9:30pm",
    "10:00pm",
];

const ageOptions = [
    { label: "Any", min: AGE_MIN, max: AGE_MAX },
    { label: "18-24", min: 18, max: 24 },
    { label: "25-34", min: 25, max: 34 },
    { label: "35-44", min: 35, max: 44 },
    { label: "45-60", min: 45, max: 60 },
];

type GroupOption = (typeof groupOptions)[number];
type GenderOption = (typeof genderOptions)[number];
type DateOption = "today" | "tomorrow";

const getDateStringForChoice = (choice: DateOption) => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    if (choice === "tomorrow") {
        base.setDate(base.getDate() + 1);
    }
    const year = base.getFullYear();
    const month = `${base.getMonth() + 1}`.padStart(2, "0");
    const day = `${base.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const getDateChoiceFromEventDate = (eventDate?: string): DateOption => {
    if (!eventDate) {
        return "today";
    }
    const [year, month, day] = eventDate.split("-").map((part) => Number(part));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (
        Number.isNaN(year) ||
        Number.isNaN(month) ||
        Number.isNaN(day) ||
        month < 1 ||
        day < 1
    ) {
        return "today";
    }
    const parsed = new Date(year, month - 1, day);
    const diffDays = Math.floor(
        (parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diffDays === 1 ? "tomorrow" : "today";
};

type FormState = {
    eventName: string;
    description: string;
    groupType: GroupOption;
    gender: GenderOption;
    ageRange: [number, number];
    dateChoice: DateOption;
    time: string;
    location: string;
    coverKey: CoverKey;
};

type CreateNavigation = CompositeNavigationProp<
    BottomTabNavigationProp<RootTabParamList, "Create">,
    NativeStackNavigationProp<RootStackParamList>
>;

type CreateRoute = RouteProp<RootTabParamList, "Create">;

const timeStringToMinutes = (timeLabel: string): number | null => {
    const match = timeLabel.trim().toLowerCase().match(/(\d{1,2}):(\d{2})(am|pm)?/);
    if (!match) {
        return null;
    }
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridiem = match[3];

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return null;
    }

    if (meridiem) {
        if (meridiem === "pm" && hours !== 12) {
            hours += 12;
        }
        if (meridiem === "am" && hours === 12) {
            hours = 0;
        }
    }

    return hours * 60 + minutes;
};

const formatMinutesToTime = (minutes: number) => {
  const h = Math.max(0, Math.min(23, Math.floor(minutes / 60)));
  const m = Math.max(0, Math.min(59, minutes % 60));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const computeNextAvailableTime = (choice: DateOption): string | null => {
    const now = new Date();
    const currentMinutes =
        choice === "today" ? now.getHours() * 60 + now.getMinutes() : -1;
    const next = baseTimeOptions.find((label) => {
        const minutes = timeStringToMinutes(label);
        if (minutes == null) {
            return false;
        }
        return currentMinutes === -1 || minutes > currentMinutes;
    });
    if (!next) {
        return null;
    }
    const minutes = timeStringToMinutes(next);
    return minutes != null ? formatMinutesToTime(minutes) : null;
};

const parseTimeString = (timeStr: string): { hour: number; minute: number } => {
    const minutes = timeStringToMinutes(timeStr);
    if (minutes == null) {
        return { hour: 0, minute: 0 };
    }
    const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
    return { hour: Math.floor(clamped / 60), minute: clamped % 60 };
};

const getAgeLabel = (range: [number, number]) => {
    const [min, max] = range;
    const match = ageOptions.find(
        (option) => option.min === min && option.max === max,
    );
    if (match) {
        return match.label;
    }
    if (min === AGE_MIN && max === AGE_MAX) {
        return "Any";
    }
    return `${min}-${max}`;
};

const CreateEventScreen = () => {
    const navigation = useNavigation<CreateNavigation>();
    const rootNavigation =
        navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<CreateRoute>();
    const { addUserEvent, updateUserEvent, events, queueGuestEvent } =
        useEvents();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
    const scrollViewRef = useRef<KeyboardAwareScrollView>(null);

    // Responsive scaling to fit content on screen
    const { height: windowHeight } = useWindowDimensions();
    // Available height = window - top inset - bottom inset - tab bar(~56)
    const availableHeight = windowHeight - insets.top - insets.bottom - 56;
    // Fixed content: header(50) + field cards(~320) + footer(60) + padding(16) = ~446px
    const fixedContentHeight = 446;
    // Remaining space for cover and gaps
    const remainingHeight = Math.max(availableHeight - fixedContentHeight, 120);
    // Allocate 70% to cover, 30% to gaps (7 gaps)
    const coverHeight = Math.max(remainingHeight * 0.70, 100);
    const totalGapSpace = remainingHeight * 0.30;
    const responsiveGap = Math.max(Math.floor(totalGapSpace / 7), spacing.xs);

    const editEventId = route.params?.editEventId;
    const editEvent = editEventId
        ? events.find((eventItem) => eventItem.id === editEventId)
        : null;
    const isEditing = !!editEvent;

    const initialDateChoice = getDateChoiceFromEventDate(editEvent?.eventDate);
    const initialTimeValue =
        editEvent?.time ||
        computeNextAvailableTime(initialDateChoice) ||
        "07:00";
    const initialParsedTime = parseTimeString(initialTimeValue);

    const [eventName, setEventName] = useState(editEvent?.title || "");
    const [description, setDescription] = useState(editEvent?.description || "");
    const [groupType, setGroupType] = useState<GroupOption>(
        editEvent?.groupType === "Group" ? "Group" : "Single",
    );
    const [gender, setGender] = useState<GenderOption>(
        (editEvent?.gender as GenderOption) || "Any",
    );
    const [ageRange, setAgeRange] = useState<[number, number]>([
        editEvent?.minAge || AGE_MIN,
        editEvent?.maxAge || AGE_MAX,
    ]);
    const [dateChoice, setDateChoice] = useState<DateOption>(initialDateChoice);
    const [time, setTime] = useState(initialTimeValue);
    const [hourInput, setHourInput] = useState(
        String(initialParsedTime.hour).padStart(2, "0"),
    );
    const [minuteInput, setMinuteInput] = useState(
        String(initialParsedTime.minute).padStart(2, "0"),
    );
    const [isHourEditing, setIsHourEditing] = useState(false);
    const [isMinuteEditing, setIsMinuteEditing] = useState(false);
    const [location, setLocation] = useState(editEvent?.location || "");
    const [coverKey, setCoverKey] = useState<CoverKey>(
        editEvent?.coverKey ?? DEFAULT_COVER_KEY,
    );
    const [isAgePickerVisible, setAgePickerVisible] = useState(false);
    const [isCoverPickerVisible, setCoverPickerVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const resetForm = useCallback(() => {
        setEventName("");
        setDescription("");
        setGroupType("Single");
        setGender("Any");
        setAgeRange([AGE_MIN, AGE_MAX]);
        setDateChoice("today");
        const nextTime = computeNextAvailableTime("today") ?? "07:00";
        const parsed = parseTimeString(nextTime);
        setTime(nextTime);
        setHourInput(String(parsed.hour).padStart(2, "0"));
        setMinuteInput(String(parsed.minute).padStart(2, "0"));
        setLocation("");
        setCoverKey(DEFAULT_COVER_KEY);
        setAgePickerVisible(false);
        setCoverPickerVisible(false);
        setSubmitError(null);
        setIsSubmitting(false);
    }, []);

    const applyEventToForm = useCallback((current: UserEvent) => {
        setEventName(current.title);
        setDescription(current.description ?? "");
        setGroupType(current.groupType === "Group" ? "Group" : "Single");
        setGender((current.gender as GenderOption) || "Any");
        setAgeRange([current.minAge ?? AGE_MIN, current.maxAge ?? AGE_MAX]);
        setDateChoice(getDateChoiceFromEventDate(current.eventDate));
        const nextTime = current.time || "07:00";
        const parsed = parseTimeString(nextTime);
        setTime(nextTime);
        setHourInput(String(parsed.hour).padStart(2, "0"));
        setMinuteInput(String(parsed.minute).padStart(2, "0"));
        setLocation(current.location || "");
        setCoverKey(current.coverKey ?? DEFAULT_COVER_KEY);
        setAgePickerVisible(false);
        setCoverPickerVisible(false);
        setSubmitError(null);
    }, []);

    const getCurrentFormState = useCallback(
        (): FormState => ({
            eventName,
            description,
            groupType,
            gender,
            ageRange,
            dateChoice,
            time,
            location,
            coverKey,
        }),
        [
            ageRange,
            coverKey,
            dateChoice,
            description,
            eventName,
            gender,
            groupType,
            location,
            time,
        ],
    );

    useFocusEffect(
        useCallback(() => {
            if (editEvent && editEventId) {
                applyEventToForm(editEvent);
            } else {
                resetForm();
            }

            return () => {
                if (editEventId) {
                    navigation.setParams({ editEventId: undefined } as Partial<
                        RootTabParamList["Create"]
                    >);
                }
            };
        }, [applyEventToForm, editEvent, editEventId, navigation, resetForm]),
    );

    useEffect(() => {
        if (isHourEditing) {
            return;
        }
        const { hour } = parseTimeString(time);
        setHourInput(String(hour).padStart(2, "0"));
    }, [isHourEditing, time]);

    useEffect(() => {
        if (isMinuteEditing) {
            return;
        }
        const { minute } = parseTimeString(time);
        setMinuteInput(String(minute).padStart(2, "0"));
    }, [isMinuteEditing, time]);

    const formatTime = (hour: number, minute: number): string => {
        const h = Math.max(0, Math.min(23, hour));
        const m = Math.max(0, Math.min(59, minute));
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };

    const handleHourChange = (value: string) => {
        const sanitized = value.replace(/[^0-9]/g, "").slice(0, 2);
        setHourInput(sanitized);
        if (!sanitized) {
            return;
        }
        const hour = Math.min(23, parseInt(sanitized, 10) || 0);
        const { minute } = parseTimeString(time);
        setTime(formatTime(hour, minute));
    };

    const handleMinuteChange = (value: string) => {
        const sanitized = value.replace(/[^0-9]/g, "").slice(0, 2);
        setMinuteInput(sanitized);
        if (!sanitized) {
            return;
        }
        const minute = Math.min(59, parseInt(sanitized, 10) || 0);
        const { hour } = parseTimeString(time);
        setTime(formatTime(hour, minute));
    };

    const handleHourBlur = () => {
        setIsHourEditing(false);
        if (!hourInput) {
            const { hour } = parseTimeString(time);
            setHourInput(String(hour).padStart(2, "0"));
            return;
        }
        if (hourInput.length === 1) {
            setHourInput(hourInput.padStart(2, "0"));
        }
    };

    const handleMinuteBlur = () => {
        setIsMinuteEditing(false);
        if (!minuteInput) {
            const { minute } = parseTimeString(time);
            setMinuteInput(String(minute).padStart(2, "0"));
            return;
        }
        if (minuteInput.length === 1) {
            setMinuteInput(minuteInput.padStart(2, "0"));
        }
    };

    const handleAgeSelect = (option: { min: number; max: number }) => {
        setAgeRange([option.min, option.max]);
        setAgePickerVisible(false);
    };

    const selectedCoverUri = useMemo(
        () => resolveCoverUri(coverKey),
        [coverKey],
    );

    const selectedCoverLabel = useMemo(() => {
        const option = COVER_OPTIONS.find((item) => item.key === coverKey);
        return option?.label ?? "Cover";
    }, [coverKey]);

    const contentContainerStyle = useMemo(
        () => [
            styles.content,
            {
                paddingBottom: spacing.sm,
                flexGrow: 1,
                gap: responsiveGap,
            },
        ],
        [responsiveGap],
    );

    // Dynamic cover card style - always use fixed height for consistency
    const coverCardStyle = useMemo(
        () => [styles.coverCard, { height: coverHeight }],
        [coverHeight],
    );

    // Use standard field card style
    const fieldCardStyle = styles.fieldCard;

    const nextGroupType = useMemo(() => {
        const values = [...groupOptions];
        return (current: GroupOption) => {
            const index = values.indexOf(current);
            return values[(index + 1) % values.length];
        };
    }, []);

    const nextGender = useMemo(() => {
        const values = [...genderOptions];
        return (current: GenderOption) => {
            const index = values.indexOf(current);
            return values[(index + 1) % values.length];
        };
    }, []);

    const toggleDateChoice = useCallback(() => {
        setDateChoice((prev) => (prev === "today" ? "tomorrow" : "today"));
    }, []);

    const handleCoverSelect = useCallback((key: CoverKey) => {
        setCoverKey(key);
        setCoverPickerVisible(false);
    }, []);

    const handleSubmit = useCallback(
        async (formOverride?: FormState) => {
            if (isSubmitting) {
                return;
            }

            const form = formOverride ?? getCurrentFormState();
            const trimmedName = form.eventName.trim();
            const trimmedDescription = form.description.trim();

            if (!trimmedName && !trimmedDescription) {
                setSubmitError("Add a name or description before publishing.");
                return;
            }

            const timeMinutes = timeStringToMinutes(form.time);
            if (timeMinutes == null) {
                setSubmitError("Enter a valid time in HH:MM format.");
                return;
            }
            if (isPastTimeSelection(form.dateChoice, form.time)) {
                setSubmitError("Choose a future time for today's events.");
                return;
            }

            if (!user) {
                setSubmitError("You must be signed in to create an event.");
                return;
            }

            setSubmitError(null);
            setIsSubmitting(true);

            const locationLabel = form.location.trim() || "To be decided";
            const [rangeStart, rangeEnd] = form.ageRange;
            const minAge = Math.min(rangeStart, rangeEnd);
            const maxAge = Math.max(rangeStart, rangeEnd);
            const selectedCover = form.coverKey || DEFAULT_COVER_KEY;
            const eventDate = getDateStringForChoice(form.dateChoice);
            const selectedLabel = form.dateChoice === "today" ? "Today" : "Tmrw";

            try {
                if (isEditing && editEventId) {
                    await updateUserEvent(editEventId, {
                        title: trimmedName || "New event",
                        location: locationLabel,
                        time: form.time,
                        eventDate,
                        dateLabel: selectedLabel,
                        description: trimmedDescription.length
                            ? trimmedDescription
                            : undefined,
                        gender: form.gender,
                        minAge,
                        maxAge,
                        groupType: form.groupType,
                        badgeLabel: form.groupType === "Group" ? "Group" : null,
                        coverKey: selectedCover,
                    });
                    navigation.goBack();
                } else {
                    await addUserEvent({
                        title: trimmedName || "New event",
                        location: locationLabel,
                        time: form.time,
                        eventDate,
                        dateLabel: selectedLabel,
                        description: trimmedDescription.length
                            ? trimmedDescription
                            : undefined,
                        gender: form.gender,
                        minAge,
                        maxAge,
                        groupType: form.groupType,
                        badgeLabel: form.groupType === "Group" ? "Group" : undefined,
                        coverKey: selectedCover,
                        userId: user.id,
                        hostName: user.name,
                    });
                    resetForm();
                    navigation.navigate("MyEvents");
                }
            } catch (err) {
                console.error("Failed to submit event", err);
                setSubmitError(
                    `Unable to ${isEditing ? "update" : "publish"} the event. Please try again.`,
                );
            } finally {
                setIsSubmitting(false);
            }
        },
        [
            addUserEvent,
            editEventId,
            getCurrentFormState,
            isEditing,
            isSubmitting,
            navigation,
            resetForm,
            updateUserEvent,
            user,
        ],
    );

    const handlePrimaryAction = () => {
        const formState = getCurrentFormState();
        const hasContent =
            formState.eventName.trim().length > 0 ||
            formState.description.trim().length > 0;

        if (!hasContent) {
            setSubmitError("Add a name or description before publishing.");
            return;
        }

        if (isPastTimeSelection(formState.dateChoice, formState.time)) {
            setSubmitError("Choose a future time for today's events.");
            return;
        }

        if (!user) {
            const trimmedName = formState.eventName.trim();
            const trimmedDescription = formState.description.trim();
            const locationLabel = formState.location.trim() || "To be decided";
            const [rangeStart, rangeEnd] = formState.ageRange;
            const minAge = Math.min(rangeStart, rangeEnd);
            const maxAge = Math.max(rangeStart, rangeEnd);
            const selectedCover = formState.coverKey || DEFAULT_COVER_KEY;
            const eventDate = getDateStringForChoice(formState.dateChoice);
            const selectedLabel = formState.dateChoice === "today" ? "Today" : "Tmrw";

            const draftPayload: GuestEventDraft = {
                title: trimmedName || "New event",
                location: locationLabel,
                time: formState.time,
                eventDate,
                dateLabel: selectedLabel,
                description: trimmedDescription.length ? trimmedDescription : undefined,
                gender: formState.gender,
                minAge,
                maxAge,
                groupType: formState.groupType,
                badgeLabel: formState.groupType === "Group" ? "Group" : undefined,
                coverKey: selectedCover,
            };

            queueGuestEvent(draftPayload);
            rootNavigation?.navigate("Login");
            return;
        }

        void handleSubmit(formState);
    };

    const primaryButtonLabel = user
        ? isSubmitting
            ? isEditing
                ? "Updating..."
                : "Publishing..."
            : isEditing
                ? "Update Event"
                : "Publish Event"
        : "Sign Up or Log In";

    const ageLabel = useMemo(() => getAgeLabel(ageRange), [ageRange]);
    const dateLabel = dateChoice === "today" ? "Today" : "Tomorrow";
    return (
        <View style={styles.root}>
            <LinearGradient
                colors={[colors.createGradientStart, colors.createGradientEnd]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                locations={[0, 1]}
                style={StyleSheet.absoluteFillObject}
            />
            <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
                {Platform.OS === "ios" ? (
                    <KeyboardAvoidingView
                        behavior="padding"
                        style={styles.overlay}
                        keyboardVerticalOffset={insets.top}
                    >
                        <View style={styles.contentWrapper}>
                            <KeyboardAwareScrollView
                                ref={scrollViewRef}
                                style={styles.formScroll}
                                contentContainerStyle={contentContainerStyle}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="interactive"
                                enableOnAndroid={true}
                                enableAutomaticScroll={true}
                                extraScrollHeight={spacing.xl * 2}
                            >
                            <View style={styles.headerRow}>
                                <Text style={styles.pageTitle}>Create Event</Text>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => navigation.goBack()}
                                    style={styles.dismissButton}
                                >
                                    <Feather
                                        name="chevron-down"
                                        size={24}
                                        color={colors.createTextPrimary}
                                    />
                                </Pressable>
                            </View>

                            <Pressable
                                style={coverCardStyle}
                                onPress={() => setCoverPickerVisible(true)}
                                accessibilityRole="button"
                            >
                                <Image source={{ uri: selectedCoverUri }} style={styles.coverImage} />
                                <View style={styles.coverChip}>
                                    <Feather
                                        name="image"
                                        size={16}
                                        color={colors.createChipActiveText}
                                    />
                                    <Text style={styles.coverChipText}>{selectedCoverLabel}</Text>
                                </View>
                            </Pressable>

                            <View style={fieldCardStyle}>
                                <TextInput
                                    placeholder="Event Name"
                                    value={eventName}
                                    onChangeText={setEventName}
                                    placeholderTextColor={colors.createTextMuted}
                                    style={styles.textInput}
                                />
                                <TextInput
                                    placeholder="Description"
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholderTextColor={colors.createTextMuted}
                                    style={[styles.textInput]}
                                    multiline
                                    numberOfLines={2}
                                    textAlignVertical="top"
                                />
                            </View>

                            <View style={fieldCardStyle}>
                                <Pressable
                                    style={styles.fieldRow}
                                    onPress={() => setGroupType((current) => nextGroupType(current))}
                                >
                                    <Text style={styles.fieldLabel}>Group Type</Text>
                                    <View style={styles.fieldValuePill}>
                                        <Text style={styles.fieldValueText}>{groupType}</Text>
                                    </View>
                                </Pressable>
                            </View>

                            <View style={fieldCardStyle}>
                                <Pressable
                                    style={styles.fieldRow}
                                    onPress={() => setGender((current) => nextGender(current))}
                                >
                                    <Text style={styles.fieldLabel}>Gender</Text>
                                    <View style={styles.fieldValuePill}>
                                        <Text style={styles.fieldValueText}>{gender}</Text>
                                    </View>
                                </Pressable>

                                <Pressable
                                    style={styles.fieldRow}
                                    onPress={() => setAgePickerVisible(true)}
                                >
                                    <Text style={styles.fieldLabel}>Age</Text>
                                    <View style={styles.fieldValuePill}>
                                        <Text style={styles.fieldValueText}>{ageLabel}</Text>
                                    </View>
                                </Pressable>
                            </View>

                            <View style={fieldCardStyle}>
                                <View style={[styles.fieldRow, styles.dateRow]}>
                                    <Text style={styles.fieldLabel}>Date & Time</Text>
                                    <View style={styles.dateTimeContainer}>
                                        <Pressable
                                            style={styles.fieldValuePill}
                                            onPress={toggleDateChoice}
                                        >
                                            <Text style={styles.fieldValueText}>{dateLabel}</Text>
                                        </Pressable>
                                        <View style={styles.timeInlineContainer}>
                                            <TextInput
                                                placeholder="HH"
                                                value={hourInput}
                                                onChangeText={handleHourChange}
                                                onFocus={() => setIsHourEditing(true)}
                                                onBlur={handleHourBlur}
                                                placeholderTextColor={colors.createTextMuted}
                                                style={styles.timeInputInline}
                                                maxLength={2}
                                                keyboardType="number-pad"
                                            />
                                            <Text style={styles.timeSeparatorInline}>:</Text>
                                            <TextInput
                                                placeholder="MM"
                                                value={minuteInput}
                                                onChangeText={handleMinuteChange}
                                                onFocus={() => setIsMinuteEditing(true)}
                                                onBlur={handleMinuteBlur}
                                                placeholderTextColor={colors.createTextMuted}
                                                style={styles.timeInputInline}
                                                maxLength={2}
                                                keyboardType="number-pad"
                                            />
                                        </View>
                                    </View>
                                </View>
                            </View>

                            <View style={fieldCardStyle}>
                                <View style={[styles.fieldRow, styles.locationRow]}>
                                    <Text style={styles.fieldLabel}>Location</Text>
                                    <TextInput
                                        placeholder="Search..."
                                        value={location}
                                        onChangeText={setLocation}
                                        placeholderTextColor={colors.createTextMuted}
                                        style={[
                                            styles.textInput,
                                            styles.compactInput,
                                            styles.locationInput,
                                        ]}
                                    />
                                </View>
                            </View>

                            <View style={styles.footer}>
                                {submitError ? (
                                    <Text style={styles.errorText}>{submitError}</Text>
                                ) : null}

                                <Pressable
                                    style={[
                                        styles.primaryButton,
                                        isSubmitting && styles.primaryButtonDisabled,
                                    ]}
                                    onPress={handlePrimaryAction}
                                    disabled={isSubmitting}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.primaryButtonText}>
                                        {primaryButtonLabel}
                                    </Text>
                                </Pressable>
                            </View>
                        </KeyboardAwareScrollView>
                    </View>
                </KeyboardAvoidingView>
                ) : (
                    <View style={[styles.overlay, styles.contentWrapper]}>
                        <KeyboardAwareScrollView
                            ref={scrollViewRef}
                            style={styles.formScroll}
                            contentContainerStyle={contentContainerStyle}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            enableOnAndroid={true}
                            enableAutomaticScroll={true}
                            extraScrollHeight={150}
                            enableResetScrollToCoords={false}
                        >
                            <View style={styles.headerRow}>
                                <Text style={styles.pageTitle}>Create Event</Text>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => navigation.goBack()}
                                    style={styles.dismissButton}
                                >
                                    <Feather
                                        name="chevron-down"
                                        size={24}
                                        color={colors.createTextPrimary}
                                    />
                                </Pressable>
                            </View>

                            <Pressable
                                style={coverCardStyle}
                                onPress={() => setCoverPickerVisible(true)}
                                accessibilityRole="button"
                            >
                                <Image source={{ uri: selectedCoverUri }} style={styles.coverImage} />
                                <View style={styles.coverChip}>
                                    <Feather
                                        name="image"
                                        size={16}
                                        color={colors.createChipActiveText}
                                    />
                                    <Text style={styles.coverChipText}>{selectedCoverLabel}</Text>
                                </View>
                            </Pressable>

                            <View style={fieldCardStyle}>
                                <TextInput
                                    placeholder="Event Name"
                                    value={eventName}
                                    onChangeText={setEventName}
                                    placeholderTextColor={colors.createTextMuted}
                                    style={styles.textInput}
                                />
                                <TextInput
                                    placeholder="Description"
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholderTextColor={colors.createTextMuted}
                                    style={[styles.textInput]}
                                    multiline
                                    numberOfLines={2}
                                    textAlignVertical="top"
                                />
                            </View>

                            <View style={fieldCardStyle}>
                                <Pressable
                                    style={styles.fieldRow}
                                    onPress={() => setGroupType((current) => nextGroupType(current))}
                                >
                                    <Text style={styles.fieldLabel}>Group Type</Text>
                                    <View style={styles.fieldValuePill}>
                                        <Text style={styles.fieldValueText}>{groupType}</Text>
                                    </View>
                                </Pressable>
                            </View>

                            <View style={fieldCardStyle}>
                                <Pressable
                                    style={styles.fieldRow}
                                    onPress={() => setGender((current) => nextGender(current))}
                                >
                                    <Text style={styles.fieldLabel}>Gender</Text>
                                    <View style={styles.fieldValuePill}>
                                        <Text style={styles.fieldValueText}>{gender}</Text>
                                    </View>
                                </Pressable>

                                <Pressable
                                    style={styles.fieldRow}
                                    onPress={() => setAgePickerVisible(true)}
                                >
                                    <Text style={styles.fieldLabel}>Age</Text>
                                    <View style={styles.fieldValuePill}>
                                        <Text style={styles.fieldValueText}>{ageLabel}</Text>
                                    </View>
                                </Pressable>
                            </View>

                            <View style={fieldCardStyle}>
                                <View style={[styles.fieldRow, styles.dateRow]}>
                                    <Text style={styles.fieldLabel}>Date & Time</Text>
                                    <View style={styles.dateTimeContainer}>
                                        <Pressable
                                            style={styles.fieldValuePill}
                                            onPress={toggleDateChoice}
                                        >
                                            <Text style={styles.fieldValueText}>{dateLabel}</Text>
                                        </Pressable>
                                        <View style={styles.timeInlineContainer}>
                                            <TextInput
                                                placeholder="HH"
                                                value={hourInput}
                                                onChangeText={handleHourChange}
                                                onFocus={() => setIsHourEditing(true)}
                                                onBlur={handleHourBlur}
                                                placeholderTextColor={colors.createTextMuted}
                                                style={styles.timeInputInline}
                                                maxLength={2}
                                                keyboardType="number-pad"
                                            />
                                            <Text style={styles.timeSeparatorInline}>:</Text>
                                            <TextInput
                                                placeholder="MM"
                                                value={minuteInput}
                                                onChangeText={handleMinuteChange}
                                                onFocus={() => setIsMinuteEditing(true)}
                                                onBlur={handleMinuteBlur}
                                                placeholderTextColor={colors.createTextMuted}
                                                style={styles.timeInputInline}
                                                maxLength={2}
                                                keyboardType="number-pad"
                                            />
                                        </View>
                                    </View>
                                </View>
                            </View>

                            <View style={fieldCardStyle}>
                                <View style={[styles.fieldRow, styles.locationRow]}>
                                    <Text style={styles.fieldLabel}>Location</Text>
                                    <TextInput
                                        placeholder="Search..."
                                        value={location}
                                        onChangeText={setLocation}
                                        placeholderTextColor={colors.createTextMuted}
                                        style={[
                                            styles.textInput,
                                            styles.compactInput,
                                            styles.locationInput,
                                        ]}
                                    />
                                </View>
                            </View>

                            <View style={styles.footer}>
                                {submitError ? (
                                    <Text style={styles.errorText}>{submitError}</Text>
                                ) : null}

                                <Pressable
                                    style={[
                                        styles.primaryButton,
                                        isSubmitting && styles.primaryButtonDisabled,
                                    ]}
                                    onPress={handlePrimaryAction}
                                    disabled={isSubmitting}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.primaryButtonText}>
                                        {primaryButtonLabel}
                                    </Text>
                                </Pressable>
                            </View>
                        </KeyboardAwareScrollView>
                    </View>
                )}
            </SafeAreaView>

            <Modal visible={isCoverPickerVisible} transparent animationType="fade">
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => setCoverPickerVisible(false)}
                >
                    <View style={[styles.modalContent, styles.coverModalContent]}>
                        <View style={styles.coverModalHeader}>
                            <Text style={styles.coverModalTitle}>Choose a cover</Text>
                            <Text style={styles.coverModalSubtitle}>
                                Pick a card that best matches your vibe.
                            </Text>
                        </View>
                        <FlatList
                            data={COVER_OPTIONS}
                            numColumns={2}
                            keyExtractor={(item) => item.key}
                            columnWrapperStyle={styles.coverColumn}
                            contentContainerStyle={styles.coverGrid}
                            renderItem={({ item }) => {
                                const isSelected = item.key === coverKey;
                                return (
                                    <Pressable
                                        style={[
                                            styles.coverOption,
                                            isSelected && styles.coverOptionSelected,
                                        ]}
                                        onPress={() => handleCoverSelect(item.key)}
                                    >
                                        <Image
                                            source={item.source}
                                            style={styles.coverOptionImage}
                                        />
                                    </Pressable>
                                );
                            }}
                            ListFooterComponent={<View style={{ height: spacing.md }} />}
                            showsVerticalScrollIndicator={false}
                        />
                    </View>
                </Pressable>
            </Modal>

            <Modal visible={isAgePickerVisible} transparent animationType="fade">
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => setAgePickerVisible(false)}
                >
                    <View style={styles.modalContent}>
                        <ScrollView
                            contentContainerStyle={styles.modalListContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {ageOptions.map((option) => (
                                <Pressable
                                    key={option.label}
                                    style={styles.modalOption}
                                    onPress={() => handleAgeSelect(option)}
                                >
                                    <Text style={styles.modalOptionText}>{option.label}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "transparent",
    },
    safeArea: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        paddingTop: 0,
        paddingHorizontal: spacing.lg,
    },
    contentWrapper: {
        flex: 1,
    },
    formScroll: {
        flex: 1,
    },
    content: {
        paddingBottom: spacing.lg,
    },
    footer: {
        paddingTop: spacing.md,
        gap: spacing.sm,
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
    },
    pageTitle: {
        fontSize: typography.header,
        fontFamily: typography.fontFamilySemiBold,
        color: colors.card,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    dismissButton: {
        padding: spacing.sm,
    },
    coverCard: {
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: colors.createCardBackground,
        borderWidth: 1,
        borderColor: colors.createCardBorder,
        width: "100%",
        justifyContent: "flex-end",
        alignItems: "center",
        position: "relative",
    },
    coverImage: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        resizeMode: "cover",
    },
    coverChip: {
        position: "absolute",
        bottom: spacing.sm,
        right: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: 999,
        backgroundColor: colors.createChipActiveBackground,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        zIndex: 1,
    },
    coverChipText: {
        fontSize: typography.caption,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createChipActiveText,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    fieldCard: {
        backgroundColor: colors.createCardBackground,
        borderRadius: 12,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderWidth: 1,
        borderColor: colors.createCardBorder,
        gap: 8,
    },
    textInput: {
        fontSize: typography.subtitle,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextPrimary,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    // descriptionInput: {
    //   minHeight: 80
    // },
    compactInput: {
        backgroundColor: colors.createChipBackground,
        borderRadius: 12,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        fontSize: typography.body,
    },
    fieldRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    fieldLabel: {
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextLabel,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    fieldValuePill: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: 999,
        backgroundColor: colors.createChipBackground,
    },
    fieldValueText: {
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextPrimary,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    dateRow: {
        gap: spacing.md,
    },
    dateTimeContainer: {
        flexDirection: "row",
        gap: spacing.sm,
    },
    dateToggle: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        flex: 1,
    },
    timePill: {
        marginLeft: spacing.sm,
    },
    timeInlineContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: 10,
        backgroundColor: colors.createChipBackground,
        borderWidth: 1,
        borderColor: colors.createCardBorder,
    },
    locationRow: {
        alignItems: "center",
        gap: spacing.md,
    },
    locationInput: {
        flex: 1,
        textAlignVertical: "center",
    },
    timeInputInline: {
        width: 32,
        height: 26,
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextPrimary,
        textAlign: "center",
        padding: 0,
    },
    timeSeparatorInline: {
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextPrimary,
        marginHorizontal: spacing.xs,
    },
    errorText: {
        textAlign: "center",
        color: colors.createTextPrimary,
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
        backgroundColor: colors.createCardBackground,
        borderRadius: 12,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    primaryButton: {
        backgroundColor: colors.createButtonBackground,
        borderRadius: 999,
        paddingVertical: spacing.md,
        alignItems: "center",
        width: "100%",
    },
    primaryButtonDisabled: {
        opacity: 0.7,
    },
    primaryButtonText: {
        color: colors.createButtonText,
        fontSize: typography.subtitle,
        fontFamily: typography.fontFamilySemiBold,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: colors.createOverlay,
        justifyContent: "flex-end",
    },
    modalContent: {
        backgroundColor: colors.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        width: "100%",
    },
    modalListContent: {
        gap: spacing.sm,
    },
    modalOption: {
        paddingVertical: spacing.sm,
        alignItems: "center",
    },
    modalOptionDisabled: {
        opacity: 0.4,
    },
    modalOptionText: {
        fontSize: typography.subtitle,
        fontFamily: typography.fontFamilyRegular,
        color: colors.text,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    modalOptionTextDisabled: {
        color: colors.cardMeta,
    },
    coverModalContent: {
        gap: spacing.md,
        maxHeight: "80%",
        minHeight: "55%",
    },
    coverModalHeader: {
        gap: spacing.xs,
        marginBottom: spacing.sm,
    },
    coverModalTitle: {
        fontSize: typography.subtitle,
        fontFamily: typography.fontFamilySemiBold,
        color: colors.text,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    coverModalSubtitle: {
        fontSize: typography.caption,
        fontFamily: typography.fontFamilyMedium,
        color: colors.cardMeta,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    coverGrid: {
        paddingBottom: spacing.sm,
    },
    coverColumn: {
        justifyContent: "space-between",
        columnGap: spacing.sm,
        marginBottom: spacing.sm,
    },
    coverOption: {
        flex: 1,
        minWidth: 0,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: colors.createCardBorder,
        overflow: "hidden",
        backgroundColor: colors.createCardBackground,
    },
    coverOptionSelected: {
        borderColor: colors.primary,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 4,
    },
    coverOptionImage: {
        width: "100%",
        height: 140,
        resizeMode: "cover",
    },
});

export default CreateEventScreen;
const isPastTimeSelection = (choice: DateOption, timeValue: string): boolean => {
  if (choice !== "today") {
    return false;
  }
  const minutes = timeStringToMinutes(timeValue);
  if (minutes == null) {
    return true;
  }
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return minutes <= nowMinutes;
};
