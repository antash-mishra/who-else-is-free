import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import ScreenContainer from '@components/ScreenContainer';
import { RootTabParamList } from '@navigation/types';
import { colors, spacing, typography } from '@theme/index';
import { useEvents } from '@context/EventsContext';

const AGE_MIN = 18;
const AGE_MAX = 60;
const DEFAULT_EVENT_IMAGE =
  'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=400&q=80';

const groupOptions = ['Single', 'Group'] as const;
const genderOptions = ['Any', 'Female', 'Male'] as const;
const dateOptions = ['today', 'tomorrow'] as const;
const baseTimeOptions = ['7:00pm', '7:30pm', '8:00pm', '8:30pm', '9:00pm', '9:30pm', '10:00pm'];

type GroupOption = (typeof groupOptions)[number];
type GenderOption = (typeof genderOptions)[number];
type DateOption = (typeof dateOptions)[number];

type CreateNavigation = BottomTabNavigationProp<RootTabParamList, 'Create'>;

const timeStringToMinutes = (timeLabel: string) => {
  const match = timeLabel.match(/(\d{1,2}):(\d{2})(am|pm)/i);
  if (!match) {
    return 0;
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toLowerCase();

  if (meridiem === 'pm' && hours !== 12) {
    hours += 12;
  }
  if (meridiem === 'am' && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
};

const CreateEventScreen = () => {
  const navigation = useNavigation<CreateNavigation>();
  const { addUserEvent } = useEvents();

  const [eventName, setEventName] = useState('');
  const [description, setDescription] = useState('');
  const [groupType, setGroupType] = useState<GroupOption>('Single');
  const [gender, setGender] = useState<GenderOption>('Any');
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 25]);
  const [dateChoice, setDateChoice] = useState<DateOption>('today');
  const [time, setTime] = useState('7:00pm');
  const [location, setLocation] = useState('');
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(0);

  const timeOptions = useMemo(() => {
    const now = new Date();
    const currentMinutes = dateChoice === 'today' ? now.getHours() * 60 + now.getMinutes() : 0;

    return baseTimeOptions.map((label) => {
      const minutes = timeStringToMinutes(label);
      const isPast = dateChoice === 'today' && minutes <= currentMinutes;
      return { label, disabled: isPast };
    });
  }, [dateChoice]);

  const handleTimeSelect = (value: string) => {
    setTime(value);
    setTimePickerVisible(false);
  };

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

  return (
    <ScreenContainer>
      <View style={styles.flexFill}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <TextInput
              placeholder="Event name"
              value={eventName}
              onChangeText={setEventName}
              placeholderTextColor={colors.muted}
              style={styles.titleInput}
            />
            <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.closeButton}>
              <Feather name="x" size={24} color={colors.text} />
            </Pressable>
          </View>

          <TextInput
            placeholder="Description"
            value={description}
            onChangeText={setDescription}
            placeholderTextColor={colors.muted}
            style={styles.descriptionInput}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View style={styles.fieldStack}>
          <Pressable style={styles.fieldRow} onPress={() => setGroupType((current) => nextGroupType(current))}>
            <Text style={styles.fieldLabel}>Group Type</Text>
            <Text style={styles.fieldValue}>{groupType}</Text>
          </Pressable>

          <Pressable style={styles.fieldRow} onPress={() => setGender((current) => nextGender(current))}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <Text style={styles.fieldValue}>{gender}</Text>
          </Pressable>

          <View style={[styles.fieldRow, styles.ageField]}>
            <View style={styles.ageHeader}>
              <Text style={styles.fieldLabel}>Age</Text>
              <Text style={styles.fieldValue}>{`${ageRange[0]} to ${ageRange[1]}`}</Text>
            </View>
            <View
              style={styles.sliderContainer}
              onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
            >
              {sliderWidth > 0 && (
                <MultiSlider
                  values={ageRange}
                  min={AGE_MIN}
                  max={AGE_MAX}
                  step={1}
                  sliderLength={sliderWidth}
                  onValuesChange={([minValue, maxValue]) => {
                    setAgeRange([Math.round(minValue), Math.round(maxValue)]);
                  }}
                  allowOverlap={false}
                  snapped
                  selectedStyle={styles.sliderSelected}
                  unselectedStyle={styles.sliderUnselected}
                  trackStyle={styles.sliderTrack}
                  markerStyle={styles.sliderMarker}
                  pressedMarkerStyle={styles.sliderMarkerActive}
                />
              )}
            </View>
          </View>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Date</Text>
          <View style={styles.dateControls}>
            {dateOptions.map((option) => {
              const isActive = option === dateChoice;
              const label = option === 'today' ? 'Today' : 'Tmrw';
              return (
                <Pressable
                  key={option}
                  onPress={() => setDateChoice(option)}
                  style={[styles.datePill, isActive && styles.datePillActive]}
                >
                  <Text style={[styles.datePillText, isActive && styles.datePillTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.timeInput} onPress={() => setTimePickerVisible(true)}>
              <Text style={styles.timeInputText}>{time}</Text>
            </Pressable>
          </View>
        </View>

        <TextInput
          placeholder="Location"
          value={location}
          onChangeText={setLocation}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.locationInput]}
        />
      </ScrollView>

        <Pressable style={styles.primaryButton} onPress={() => {
          const title = eventName.trim() || 'New event';
          const locationLabel = location.trim() || 'To be decided';
          const audienceLabel = `${gender === 'Any' ? 'Any gender' : gender}, ${ageRange[0]} to ${ageRange[1]} years`;
          addUserEvent({
            title,
            location: locationLabel,
            time,
            audience: audienceLabel,
            imageUri: DEFAULT_EVENT_IMAGE,
            badgeLabel: groupType === 'Group' ? 'Group' : undefined,
            dateLabel: dateChoice === 'today' ? 'Today' : 'Tmrw',
            description: description.trim()
          });
          navigation.navigate('Events', { initialTab: 'mine' });
        }}>
          <Text style={styles.primaryButtonText}>Create</Text>
        </Pressable>
      </View>

      <Modal visible={isTimePickerVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setTimePickerVisible(false)}>
          <View style={styles.modalContent}>
            <ScrollView contentContainerStyle={styles.modalListContent} showsVerticalScrollIndicator={false}>
              {timeOptions.map(({ label, disabled }) => (
                <Pressable
                  key={label}
                  style={[styles.modalOption, disabled && styles.modalOptionDisabled]}
                  onPress={() => handleTimeSelect(label)}
                  disabled={disabled}
                >
                  <Text
                    style={[styles.modalOptionText, disabled && styles.modalOptionTextDisabled]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
    flexGrow: 1
  },
  flexFill: {
    flex: 1,
    justifyContent: 'space-between'
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  titleInput: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilyBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 0
  },
  closeButton: {
    padding: spacing.sm
  },
  input: {
    borderRadius: 16,
    borderWidth: 0,
    backgroundColor: colors.fieldBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  descriptionInput: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    paddingHorizontal: 0,
    paddingVertical: spacing.xs
  },
  fieldStack: {
    gap: spacing.sm
  },
  fieldRow: {
    backgroundColor: colors.fieldBackground,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  fieldLabel: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyMedium,
    color: colors.fieldLabel,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  fieldValue: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.fieldLabel,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  ageField: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm
  },
  ageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sliderContainer: {
    width: '100%',
    paddingVertical: spacing.sm
  },
  sliderTrack: {
    height: 1,
    borderRadius: 2
  },
  sliderSelected: {
    backgroundColor: colors.primary
  },
  sliderUnselected: {
    backgroundColor: colors.sliderUnselected
  },
  sliderMarker: {
    height: 20,
    width: 20,
    borderRadius: 10,
    backgroundColor: colors.sliderMarker
  },
  sliderMarkerActive: {
    height: 24,
    width: 24,
    borderRadius: 12,
    backgroundColor: colors.sliderMarker
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  datePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.datePill
  },
  datePillActive: {
    backgroundColor: colors.text
  },
  datePillText: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyMedium,
    color: colors.fieldLabel,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  datePillTextActive: {
    color: colors.buttonText
  },
  timeInput: {
    borderRadius: 12,
    backgroundColor: colors.datePill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timeInputText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.fieldLabel,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  locationInput: {
    marginTop: spacing.sm
  },
  primaryButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg
  },
  modalListContent: {
    gap: spacing.sm
  },
  modalOption: {
    paddingVertical: spacing.sm
  },
  modalOptionDisabled: {
    opacity: 0.4
  },
  modalOptionText: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    textAlign: 'center'
  },
  modalOptionTextDisabled: {
    color: colors.cardMeta
  }
});


export default CreateEventScreen;
