import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

const timeStringToMinutes = (timeLabel: string) => {
  const match = timeLabel.match(/(\d{1,2}):(\d{2})(am|pm)/i);
  if (!match) {
    return 0;
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toLowerCase();

  if (meridiem === "pm" && hours !== 12) {
    hours += 12;
  }
  if (meridiem === "am" && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
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

  const editEventId = route.params?.editEventId;
  const editEvent = editEventId
    ? events.find((eventItem) => eventItem.id === editEventId)
    : null;
  const isEditing = !!editEvent;

  const [eventName, setEventName] = useState(editEvent?.title || "");
  const [description, setDescription] = useState(editEvent?.description || "");
  const [groupType, setGroupType] = useState<GroupOption>(
    editEvent?.badgeLabel === "Group" ? "Group" : "Single",
  );
  const [gender, setGender] = useState<GenderOption>(
    (editEvent?.gender as GenderOption) || "Any",
  );
  const [ageRange, setAgeRange] = useState<[number, number]>([
    editEvent?.minAge || AGE_MIN,
    editEvent?.maxAge || AGE_MAX,
  ]);
  const [dateChoice, setDateChoice] = useState<DateOption>(
    editEvent?.dateLabel === "Tmrw" ? "tomorrow" : "today",
  );
  const [time, setTime] = useState(editEvent?.time || "7:00pm");
  const [location, setLocation] = useState(editEvent?.location || "");
  const [coverKey, setCoverKey] = useState<CoverKey>(
    editEvent?.coverKey ?? DEFAULT_COVER_KEY,
  );
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
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
    setTime("7:00pm");
    setLocation("");
    setCoverKey(DEFAULT_COVER_KEY);
    setTimePickerVisible(false);
    setAgePickerVisible(false);
    setCoverPickerVisible(false);
    setSubmitError(null);
    setIsSubmitting(false);
  }, []);

  const applyEventToForm = useCallback((current: UserEvent) => {
    setEventName(current.title);
    setDescription(current.description ?? "");
    setGroupType(current.badgeLabel === "Group" ? "Group" : "Single");
    setGender((current.gender as GenderOption) || "Any");
    setAgeRange([current.minAge ?? AGE_MIN, current.maxAge ?? AGE_MAX]);
    setDateChoice(current.dateLabel === "Tmrw" ? "tomorrow" : "today");
    setTime(current.time || "7:00pm");
    setLocation(current.location || "");
    setCoverKey(current.coverKey ?? DEFAULT_COVER_KEY);
    setTimePickerVisible(false);
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

  const timeOptions = useMemo(() => {
    const now = new Date();
    const currentMinutes =
      dateChoice === "today" ? now.getHours() * 60 + now.getMinutes() : 0;

    return baseTimeOptions.map((label) => {
      const minutes = timeStringToMinutes(label);
      const isPast = dateChoice === "today" && minutes <= currentMinutes;
      return { label, disabled: isPast };
    });
  }, [dateChoice]);

  const handleTimeSelect = (value: string) => {
    setTime(value);
    setTimePickerVisible(false);
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

      try {
        if (isEditing && editEventId) {
          await updateUserEvent(editEventId, {
            title: trimmedName || "New event",
            location: locationLabel,
            time: form.time,
            description: trimmedDescription.length
              ? trimmedDescription
              : undefined,
            gender: form.gender,
            minAge,
            maxAge,
            dateLabel: form.dateChoice === "today" ? "Today" : "Tmrw",
            badgeLabel: form.groupType === "Group" ? "Group" : null,
            coverKey: selectedCover,
          });
          navigation.goBack();
        } else {
          await addUserEvent({
            title: trimmedName || "New event",
            location: locationLabel,
            time: form.time,
            description: trimmedDescription.length
              ? trimmedDescription
              : undefined,
            gender: form.gender,
            minAge,
            maxAge,
            dateLabel: form.dateChoice === "today" ? "Today" : "Tmrw",
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

    if (!user) {
      const trimmedName = formState.eventName.trim();
      const trimmedDescription = formState.description.trim();
      const locationLabel = formState.location.trim() || "To be decided";
      const [rangeStart, rangeEnd] = formState.ageRange;
      const minAge = Math.min(rangeStart, rangeEnd);
      const maxAge = Math.max(rangeStart, rangeEnd);
      const selectedCover = formState.coverKey || DEFAULT_COVER_KEY;

      const draftPayload: GuestEventDraft = {
        title: trimmedName || "New event",
        location: locationLabel,
        time: formState.time,
        description: trimmedDescription.length ? trimmedDescription : undefined,
        gender: formState.gender,
        minAge,
        maxAge,
        dateLabel: formState.dateChoice === "today" ? "Today" : "Tmrw",
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
      <View style={styles.overlay}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
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
            style={styles.coverCard}
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

          <View style={styles.fieldCard}>
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

          <View style={styles.fieldCard}>
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

          <View style={styles.fieldCard}>
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
                <Pressable
                  style={[styles.fieldValuePill, styles.timePill]}
                  onPress={() => setTimePickerVisible(true)}
                >
                  <Text style={styles.fieldValueText}>{time}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.fieldCard}>
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
            <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
          </Pressable>
        </ScrollView>
      </View>

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
              numColumns={3}
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

      <Modal visible={isTimePickerVisible} transparent animationType="fade">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setTimePickerVisible(false)}
        >
          <View style={styles.modalContent}>
            <ScrollView
              contentContainerStyle={styles.modalListContent}
              showsVerticalScrollIndicator={false}
            >
              {timeOptions.map(({ label, disabled }) => (
                <Pressable
                  key={label}
                  style={[
                    styles.modalOption,
                    disabled && styles.modalOptionDisabled,
                  ]}
                  onPress={() => handleTimeSelect(label)}
                  disabled={disabled}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      disabled && styles.modalOptionTextDisabled,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
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
  overlay: {
    flex: 1,
    paddingTop: spacing.lg - spacing.md,
    paddingHorizontal: spacing.lg,
  },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.lg,
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
    height: 177,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    resizeMode: "cover",
  },
  coverChip: {
    alignSelf: "flex-end",
    margin: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.createChipActiveBackground,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
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
  locationRow: {
    alignItems: "center",
    gap: spacing.md,
  },
  locationInput: {
    flex: 1,
    textAlignVertical: "center",
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
    marginTop: spacing.lg,
    backgroundColor: colors.createButtonBackground,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: "center",
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
    height: 78,
    resizeMode: "cover",
  },
});

export default CreateEventScreen;
