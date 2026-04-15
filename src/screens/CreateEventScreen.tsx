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
    RouteProp,
    useFocusEffect,
    useNavigation,
    useRoute,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import { RootStackParamList } from "@navigation/types";
import { colors, spacing } from "@theme/index";
import { GuestEventDraft, UserEvent, useEvents } from "@context/EventsContext";
import { useAuth } from "@context/AuthContext";
import { CoverKey, DEFAULT_COVER_KEY, resolveCoverUri } from "@constants/covers";
import {
    AGE_MAX,
    AGE_MIN,
    AgeOption,
    ageOptions,
    GenderOption,
    genderDisplayLabels,
    genderOptions,
    getAgeLabel,
    GroupOption,
    groupDisplayLabels,
    groupOptions,
} from "@constants/eventOptions";
import {
    combineDateAndTime,
    formatDateTimeValue,
    formatTime,
    getDefaultEventDateTime,
    getLegacyDateLabel,
    getMaxEventDateTime,
    isPastDateTimeSelection,
    toDateKey,
} from "@utils/dateTime";
import UploadIcon from "@assets/upload.svg";
import WarningIcon from "@assets/warning.svg";
import SelectionModal from "@components/SelectionModal";
import CoverPickerModal from "@components/CoverPickerModal";
import EventDateTimeModal from "@components/EventDateTimeModal";
import BottomSheetModal from "../components/BottomSheetModal";
import SignInButtons from "../components/SignInButtons";
import styles from "./CreateEventScreen.styles";

type FormState = {
    eventName: string;
    description: string;
    groupType: GroupOption;
    gender: GenderOption;
    ageRange: [number, number];
    selectedDateTime: Date;
    location: string;
    coverKey: CoverKey;
};

type CreateNavigation = NativeStackNavigationProp<RootStackParamList, "CreateEvent">;

type CreateRoute = RouteProp<RootStackParamList, "CreateEvent">;

const EVENT_DATE_WINDOW_DAYS = 30;

const getEventDateTime = (event?: UserEvent | null): Date => {
    if (!event) {
        return getDefaultEventDateTime();
    }

    if (event.scheduledAt) {
        const parsed = new Date(event.scheduledAt);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    const combined = combineDateAndTime(event.eventDate, event.time);
    if (combined) {
        return combined;
    }

    return getDefaultEventDateTime();
};

const CreateEventScreen = () => {
    const navigation = useNavigation<CreateNavigation>();
    const route = useRoute<CreateRoute>();
    const { addUserEvent, updateUserEvent, events, queueGuestEvent } =
        useEvents();
    const { user } = useAuth();
    const scrollViewRef = useRef<KeyboardAwareScrollView>(null);

    // Responsive gap for spacing between form elements
    const responsiveGap = spacing.xs;

    const editEventIdParam = route.params?.editEventId;
    const editEventId =
        typeof editEventIdParam === "string" && editEventIdParam.trim().length > 0
            ? editEventIdParam
            : undefined;
    const editEvent = editEventId
        ? events.find((eventItem) => eventItem.id === editEventId)
        : null;
    const isEditing = !!editEvent;

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
    const [selectedDateTime, setSelectedDateTime] = useState<Date>(() =>
        getEventDateTime(editEvent),
    );
    const [location, setLocation] = useState(editEvent?.location || "");
    const [coverKey, setCoverKey] = useState<CoverKey>(
        editEvent?.coverKey ?? DEFAULT_COVER_KEY,
    );

    // Modal visibility state
    const [isAgePickerVisible, setAgePickerVisible] = useState(false);
    const [isGenderPickerVisible, setGenderPickerVisible] = useState(false);
    const [isGroupTypePickerVisible, setGroupTypePickerVisible] = useState(false);
    const [isCoverPickerVisible, setCoverPickerVisible] = useState(false);
    const [isDateTimePickerVisible, setDateTimePickerVisible] = useState(false);

    // Sign-in modal state
    const [signInVisible, setSignInVisible] = useState(false);

    // Submission state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Temporary selection states for modal confirmation
    const [tempAgeRange, setTempAgeRange] = useState<[number, number]>(ageRange);
    const [tempGender, setTempGender] = useState<GenderOption>(gender);
    const [tempGroupType, setTempGroupType] = useState<GroupOption>(groupType);

    const pickerMinDate = useMemo(
        () => new Date(),
        [isDateTimePickerVisible],
    );

    const pickerMaxDate = useMemo(
        () => getMaxEventDateTime(new Date(), EVENT_DATE_WINDOW_DAYS),
        [isDateTimePickerVisible],
    );

    const resetForm = useCallback(() => {
        setEventName("");
        setDescription("");
        setGroupType("Single");
        setGender("Any");
        setAgeRange([AGE_MIN, AGE_MAX]);
        setSelectedDateTime(getDefaultEventDateTime());
        setLocation("");
        setCoverKey(DEFAULT_COVER_KEY);
        setAgePickerVisible(false);
        setCoverPickerVisible(false);
        setDateTimePickerVisible(false);
        setSubmitError(null);
        setIsSubmitting(false);
    }, []);

    const applyEventToForm = useCallback((current: UserEvent) => {
        setEventName(current.title);
        setDescription(current.description ?? "");
        setGroupType(current.groupType === "Group" ? "Group" : "Single");
        setGender((current.gender as GenderOption) || "Any");
        setAgeRange([current.minAge ?? AGE_MIN, current.maxAge ?? AGE_MAX]);
        setSelectedDateTime(getEventDateTime(current));
        setLocation(current.location || "");
        setCoverKey(current.coverKey ?? DEFAULT_COVER_KEY);
        setAgePickerVisible(false);
        setCoverPickerVisible(false);
        setDateTimePickerVisible(false);
        setSubmitError(null);
    }, []);

    const getCurrentFormState = useCallback(
        (): FormState => ({
            eventName,
            description,
            groupType,
            gender,
            ageRange,
            selectedDateTime,
            location,
            coverKey,
        }),
        [
            ageRange,
            coverKey,
            description,
            eventName,
            gender,
            groupType,
            location,
            selectedDateTime,
        ],
    );

    useFocusEffect(
        useCallback(() => {
            if (editEvent && editEventId) {
                applyEventToForm(editEvent);
            } else {
                resetForm();
            }
        }, [applyEventToForm, editEvent, editEventId, resetForm]),
    );

    useEffect(() => {
        if (user && signInVisible) {
            setSignInVisible(false);
        }
    }, [user, signInVisible]);

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

            if (Number.isNaN(form.selectedDateTime.getTime())) {
                setSubmitError("Choose a valid date and time.");
                return;
            }

            const now = new Date();
            const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
            const normalizedDateTime = new Date(form.selectedDateTime);
            normalizedDateTime.setSeconds(0, 0);

            if (isPastDateTimeSelection(normalizedDateTime, now)) {
                setSubmitError("Choose a future date and time.");
                return;
            }

            if (normalizedDateTime.getTime() > maxAllowedDate.getTime()) {
                setSubmitError("Choose a time within the next 30 days.");
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
            const eventDate = toDateKey(normalizedDateTime);
            const eventTime = formatTime(
                normalizedDateTime.getHours(),
                normalizedDateTime.getMinutes(),
            );
            const selectedLabel = getLegacyDateLabel(eventDate);
            const scheduledAt = normalizedDateTime.toISOString();

            try {
                if (isEditing && editEventId) {
                    await updateUserEvent(editEventId, {
                        title: trimmedName || "New event",
                        location: locationLabel,
                        time: eventTime,
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
                    navigation.navigate("EventDetails", {
                        eventId: String(editEventId),
                        origin: "MyEvents",
                        showEventUpdatedBadge: true,
                    });
                } else {
                    await addUserEvent({
                        title: trimmedName || "New event",
                        location: locationLabel,
                        time: eventTime,
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
                    (navigation as any).navigate("Main", {
                        screen: "MyEvents",
                        params: { showEventCreatedBadge: true },
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

        // Guest user flow — always open sign-in modal
        if (!user) {
            const hasContent =
                formState.eventName.trim().length > 0 ||
                formState.description.trim().length > 0;

            if (hasContent) {
                // Validate date/time only when there's content to publish
                if (Number.isNaN(formState.selectedDateTime.getTime())) {
                    setSubmitError("Choose a valid date and time.");
                    return;
                }

                const now = new Date();
                const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
                if (isPastDateTimeSelection(formState.selectedDateTime, now)) {
                    setSubmitError("Choose a future date and time.");
                    return;
                }

                if (formState.selectedDateTime.getTime() > maxAllowedDate.getTime()) {
                    setSubmitError("Choose a time within the next 30 days.");
                    return;
                }

                // Queue the draft for auto-submit after sign-in
                const trimmedName = formState.eventName.trim();
                const trimmedDescription = formState.description.trim();
                const locationLabel = formState.location.trim() || "To be decided";
                const [rangeStart, rangeEnd] = formState.ageRange;
                const minAge = Math.min(rangeStart, rangeEnd);
                const maxAge = Math.max(rangeStart, rangeEnd);
                const selectedCover = formState.coverKey || DEFAULT_COVER_KEY;
                const normalizedDateTime = new Date(formState.selectedDateTime);
                normalizedDateTime.setSeconds(0, 0);

                const eventDate = toDateKey(normalizedDateTime);
                const selectedLabel = getLegacyDateLabel(eventDate);
                const eventTime = formatTime(
                    normalizedDateTime.getHours(),
                    normalizedDateTime.getMinutes(),
                );
                const scheduledAt = normalizedDateTime.toISOString();

                const draftPayload: GuestEventDraft = {
                    title: trimmedName || "New event",
                    location: locationLabel,
                    time: eventTime,
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
            }

            // Always open sign-in modal (no validation blocking for empty fields)
            setSubmitError(null);
            setSignInVisible(true);
            return;
        }

        // Authenticated user flow — validate and submit
        const hasContent =
            formState.eventName.trim().length > 0 ||
            formState.description.trim().length > 0;

        if (!hasContent) {
            setSubmitError("Add a name or description before publishing.");
            return;
        }

        if (Number.isNaN(formState.selectedDateTime.getTime())) {
            setSubmitError("Choose a valid date and time.");
            return;
        }

        const now = new Date();
        const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
        if (isPastDateTimeSelection(formState.selectedDateTime, now)) {
            setSubmitError("Choose a future date and time.");
            return;
        }

        if (formState.selectedDateTime.getTime() > maxAllowedDate.getTime()) {
            setSubmitError("Choose a time within the next 30 days.");
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
    const dateTimeLabel = useMemo(
        () => formatDateTimeValue(selectedDateTime),
        [selectedDateTime],
    );

    // Fixed header component (outside scroll view)
    const renderHeader = () => (
        <View style={styles.headerRow}>
            <Text style={styles.pageTitle}>{isEditing ? "Edit Details" : "Create Event"}</Text>
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
                <View style={styles.fieldCardInner}>
                    <TextInput
                        placeholder="Event Name"
                        value={eventName}
                        onChangeText={setEventName}
                        placeholderTextColor="rgba(255, 255, 255, 0.6)"
                        cursorColor="#FFFFFF"
                        selectionColor="#FFFFFF"
                        style={styles.textInput}
                    />
                    <View style={styles.fieldDivider} />
                    <TextInput
                        placeholder="Description"
                        value={description}
                        onChangeText={setDescription}
                        placeholderTextColor="rgba(255, 255, 255, 0.6)"
                        cursorColor="#FFFFFF"
                        selectionColor="#FFFFFF"
                        style={[styles.textInput, styles.descriptionInput]}
                        multiline
                        textAlignVertical="top"
                    />
                </View>
            </View>

            <View style={styles.fieldCard}>
                <View style={styles.fieldCardInner}>
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
            </View>

            <View style={styles.fieldCard}>
                <View style={styles.fieldCardInner}>
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
            </View>

            <View style={styles.fieldCard}>
                <View style={styles.fieldCardInner}>
                    <Pressable
                        style={[styles.fieldRow, styles.dateRow]}
                        onPress={() => setDateTimePickerVisible(true)}
                    >
                        <Text style={styles.fieldLabel}>Date & Time</Text>
                        <View style={[styles.fieldValuePill, styles.dateTimeValuePill]}>
                            <Text
                                style={[styles.fieldValueText, styles.dateTimeValueText]}
                                numberOfLines={1}
                            >
                                {dateTimeLabel}
                            </Text>
                        </View>
                    </Pressable>

                    <View style={styles.fieldDivider} />

                    <View style={[styles.fieldRow, styles.locationRow]}>
                        <Text style={styles.fieldLabel}>Location</Text>
                        <TextInput
                            placeholder="Example: Temple Bar"
                            value={location}
                            onChangeText={setLocation}
                            placeholderTextColor="rgba(255, 255, 255, 0.4)"
                            cursorColor="#FFFFFF"
                            selectionColor="#FFFFFF"
                            style={[
                                styles.textInput,
                                styles.compactInput,
                                styles.locationInput,
                            ]}
                        />
                    </View>
                </View>
            </View>

            <View style={styles.spacer} />

            <View style={styles.footer}>
                {submitError ? (
                    <View style={styles.errorContainer}>
                        <WarningIcon width={20} height={20} />
                        <Text style={styles.errorText}>{submitError}</Text>
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

            <EventDateTimeModal
                visible={isDateTimePickerVisible}
                value={selectedDateTime}
                minDate={pickerMinDate}
                maxDate={pickerMaxDate}
                onClose={() => setDateTimePickerVisible(false)}
                onConfirm={(value) => {
                    setSelectedDateTime(value);
                    setDateTimePickerVisible(false);
                }}
            />

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

            <BottomSheetModal visible={signInVisible} onClose={() => setSignInVisible(false)}>
                <SignInButtons />
            </BottomSheetModal>
        </View>
    );
};

export default CreateEventScreen;
