import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Image,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
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
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import { RootStackParamList, RootTabParamList } from "@navigation/types";
import { colors, spacing } from "@theme/index";
import { GuestEventDraft, UserEvent, useEvents } from "@context/EventsContext";
import { useAuth } from "@context/AuthContext";
import { CoverKey, DEFAULT_COVER_KEY, resolveCoverUri } from "@constants/covers";
import {
    AGE_MAX,
    AGE_MIN,
    AgeOption,
    ageOptions,
    DateOption,
    GenderOption,
    genderDisplayLabels,
    genderOptions,
    getAgeLabel,
    GroupOption,
    groupDisplayLabels,
    groupOptions,
} from "@constants/eventOptions";
import {
    buildScheduledAtUTC,
    computeNextAvailableTime,
    formatTime,
    getDateChoiceFromEventDate,
    getDateStringForChoice,
    isPastTimeSelection,
    parseTimeString,
    timeStringToMinutes,
} from "@utils/dateTime";
import UploadIcon from "@assets/upload.svg";
import WarningIcon from "@assets/warning.svg";
import SelectionModal from "@components/SelectionModal";
import CoverPickerModal from "@components/CoverPickerModal";
import styles from "./CreateEventScreen.styles";

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

const CreateEventScreen = () => {
    const navigation = useNavigation<CreateNavigation>();
    const rootNavigation =
        navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<CreateRoute>();
    const { addUserEvent, updateUserEvent, events, queueGuestEvent } =
        useEvents();
    const { user } = useAuth();
    const scrollViewRef = useRef<KeyboardAwareScrollView>(null);

    // Responsive gap for spacing between form elements
    const responsiveGap = spacing.xs;

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

    // Form state
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

    // Modal visibility state
    const [isAgePickerVisible, setAgePickerVisible] = useState(false);
    const [isGenderPickerVisible, setGenderPickerVisible] = useState(false);
    const [isGroupTypePickerVisible, setGroupTypePickerVisible] = useState(false);
    const [isCoverPickerVisible, setCoverPickerVisible] = useState(false);

    // Submission state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Temporary selection states for modal confirmation
    const [tempAgeRange, setTempAgeRange] = useState<[number, number]>(ageRange);
    const [tempGender, setTempGender] = useState<GenderOption>(gender);
    const [tempGroupType, setTempGroupType] = useState<GroupOption>(groupType);

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

    // Open modal handlers - set temp to current value
    const openAgePicker = useCallback(() => {
        setTempAgeRange(ageRange);
        setAgePickerVisible(true);
    }, [ageRange]);

    const openGenderPicker = useCallback(() => {
        setTempGender(gender);
        setGenderPickerVisible(true);
    }, [gender]);

    const openGroupTypePicker = useCallback(() => {
        setTempGroupType(groupType);
        setGroupTypePickerVisible(true);
    }, [groupType]);

    // Confirm selection handlers
    const confirmAgeSelection = useCallback(() => {
        setAgeRange(tempAgeRange);
        setAgePickerVisible(false);
    }, [tempAgeRange]);

    const confirmGenderSelection = useCallback(() => {
        setGender(tempGender);
        setGenderPickerVisible(false);
    }, [tempGender]);

    const confirmGroupTypeSelection = useCallback(() => {
        setGroupType(tempGroupType);
        setGroupTypePickerVisible(false);
    }, [tempGroupType]);

    const selectedCoverUri = useMemo(
        () => resolveCoverUri(coverKey),
        [coverKey],
    );

    const contentContainerStyle = useMemo(
        () => [
            styles.content,
            {
                paddingBottom: 0,
                flexGrow: 1,
                gap: responsiveGap,
            },
        ],
        [responsiveGap],
    );

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
            const scheduledAt = buildScheduledAtUTC(form.dateChoice, form.time);

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
                        scheduledAt,
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
                        scheduledAt,
                    });
                    resetForm();
                    navigation.navigate("MyEvents", {
                        showEventCreatedBadge: true,
                    });
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
            const scheduledAt = buildScheduledAtUTC(formState.dateChoice, formState.time);

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
                scheduledAt,
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
                : "Creating..."
            : isEditing
                ? "Update Event"
                : "Create Event"
        : "Sign Up or Log In";

    const ageLabel = useMemo(() => getAgeLabel(ageRange), [ageRange]);
    const dateLabel = dateChoice === "today" ? "Today" : "Tomorrow";

    // Fixed header component (outside scroll view)
    const renderHeader = () => (
        <View style={styles.headerRow}>
            <Text style={styles.pageTitle}>Create Event</Text>
            <Pressable
                accessibilityRole="button"
                onPress={() => navigation.goBack()}
                style={styles.dismissButton}
            >
                <Feather
                    name="x"
                    size={24}
                    color={colors.createTextPrimary}
                />
            </Pressable>
        </View>
    );

    // Shared form content to avoid iOS/Android duplication
    const renderFormContent = () => (
        <>
            <Pressable
                style={styles.coverCard}
                onPress={() => setCoverPickerVisible(true)}
                accessibilityRole="button"
            >
                <Image source={{ uri: selectedCoverUri }} style={styles.coverImage} />
                <View style={styles.coverChip}>
                    <UploadIcon width={20} height={20} />
                </View>
            </Pressable>

            <View style={styles.fieldCard}>
                <TextInput
                    placeholder="Event Name"
                    value={eventName}
                    onChangeText={setEventName}
                    placeholderTextColor={colors.createTextMuted}
                    style={styles.textInput}
                />
                <View style={styles.fieldDivider} />
                <TextInput
                    placeholder="Description"
                    value={description}
                    onChangeText={setDescription}
                    placeholderTextColor={colors.createTextMuted}
                    style={styles.textInput}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                />
            </View>

            <View style={styles.fieldCard}>
                <Pressable
                    style={styles.fieldRow}
                    onPress={openGroupTypePicker}
                >
                    <Text style={styles.fieldLabel}>Group Type</Text>
                    <View style={styles.fieldValuePill}>
                        <Text style={styles.fieldValueText}>
                            {groupDisplayLabels[groupType]}
                        </Text>
                    </View>
                </Pressable>
            </View>

            <View style={styles.fieldCard}>
                <Pressable
                    style={styles.fieldRow}
                    onPress={openGenderPicker}
                >
                    <Text style={styles.fieldLabel}>Gender</Text>
                    <View style={styles.fieldValuePill}>
                        <Text style={styles.fieldValueText}>
                            {genderDisplayLabels[gender]}
                        </Text>
                    </View>
                </Pressable>

                <View style={styles.fieldDivider} />

                <Pressable
                    style={styles.fieldRow}
                    onPress={openAgePicker}
                >
                    <Text style={styles.fieldLabel}>Age</Text>
                    <View style={styles.fieldValuePill}>
                        <Text style={styles.fieldValueText}>{ageLabel}</Text>
                    </View>
                </Pressable>
            </View>

            <View style={styles.fieldCard}>
                <View style={[styles.fieldRow, styles.dateRow]}>
                    <Text style={styles.fieldLabel}>Date</Text>
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

                <View style={styles.fieldDivider} />

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

            <View style={styles.spacer} />

            <View style={styles.footer}>
                {submitError ? (
                    <View style={styles.errorContainer}>
                        <WarningIcon width={20} height={20} />
                        <Text style={styles.errorText}>All fields are required</Text>
                    </View>
                ) : null}

                <Pressable
                    style={[
                        styles.primaryButton,
                        isSubmitting && styles.primaryButtonDisabled,
                    ]}
                    onPress={handlePrimaryAction}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                    testID="create-event-submit"
                >
                    <Text style={styles.primaryButtonText}>
                        {primaryButtonLabel}
                    </Text>
                </Pressable>
            </View>
        </>
    );

    return (
        <View style={styles.root}>
            <Image
                source={{ uri: selectedCoverUri }}
                style={styles.backgroundImage}
                resizeMode="cover"
                blurRadius={28}
            />
            <View style={styles.backgroundOverlay} />
            <SafeAreaView style={styles.safeArea} edges={["top"]}>
                {renderHeader()}
                <View style={[styles.overlay, styles.contentWrapper]}>
                    <KeyboardAwareScrollView
                        ref={scrollViewRef}
                        style={styles.formScroll}
                        contentContainerStyle={contentContainerStyle}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                        enableOnAndroid={true}
                        enableAutomaticScroll={true}
                        extraScrollHeight={0}
                        extraHeight={0}
                        enableResetScrollToCoords={false}
                        contentInsetAdjustmentBehavior="never"
                    >
                        {renderFormContent()}
                    </KeyboardAwareScrollView>
                </View>
            </SafeAreaView>

            {/* Cover Picker Modal */}
            <CoverPickerModal
                visible={isCoverPickerVisible}
                selectedCoverKey={coverKey}
                onSelect={handleCoverSelect}
                onClose={() => setCoverPickerVisible(false)}
            />

            {/* Group Type Selection Modal */}
            <SelectionModal
                visible={isGroupTypePickerVisible}
                title="Group Type"
                options={groupOptions}
                selectedValue={tempGroupType}
                onSelect={setTempGroupType}
                onConfirm={confirmGroupTypeSelection}
                onClose={() => setGroupTypePickerVisible(false)}
                getLabel={(opt) => groupDisplayLabels[opt]}
                getKey={(opt) => opt}
                isSelected={(opt, sel) => opt === sel}
            />

            {/* Gender Selection Modal */}
            <SelectionModal
                visible={isGenderPickerVisible}
                title="Gender"
                options={genderOptions}
                selectedValue={tempGender}
                onSelect={setTempGender}
                onConfirm={confirmGenderSelection}
                onClose={() => setGenderPickerVisible(false)}
                getLabel={(opt) => genderDisplayLabels[opt]}
                getKey={(opt) => opt}
                isSelected={(opt, sel) => opt === sel}
            />

            {/* Age Selection Modal */}
            <SelectionModal<AgeOption>
                visible={isAgePickerVisible}
                title="Age"
                options={ageOptions}
                selectedValue={{ label: "", min: tempAgeRange[0], max: tempAgeRange[1] }}
                onSelect={(opt) => setTempAgeRange([opt.min, opt.max])}
                onConfirm={confirmAgeSelection}
                onClose={() => setAgePickerVisible(false)}
                getLabel={(opt) => opt.label}
                getKey={(opt) => opt.label}
                isSelected={(opt, sel) => opt.min === sel.min && opt.max === sel.max}
            />
        </View>
    );
};

export default CreateEventScreen;
