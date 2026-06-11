import { Image, Pressable, Text, TextInput, View } from 'react-native';

import { BlurView } from 'expo-blur';

import UploadIcon from '@assets/create-event/choose-cover.svg';
import { colors } from '@theme/index';

import styles from '../CreateEventScreen.styles';

type CreateEventFormFieldsProps = {
  selectedCoverUri: string;
  eventName: string;
  description: string;
  groupTypeLabel: string;
  genderLabel: string;
  ageLabel: string;
  dateTimeLabel: string;
  selectedLocationLabel: string;
  onChangeEventName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onOpenCoverPicker: () => void;
  onOpenGroupTypePicker: () => void;
  onOpenGenderPicker: () => void;
  onOpenAgePicker: () => void;
  onOpenDateTimePicker: () => void;
  onOpenLocationPicker: () => void;
};

/** Create/Edit Event form body: cover card, name/description inputs, option rows. */
const CreateEventFormFields = ({
  selectedCoverUri,
  eventName,
  description,
  groupTypeLabel,
  genderLabel,
  ageLabel,
  dateTimeLabel,
  selectedLocationLabel,
  onChangeEventName,
  onChangeDescription,
  onOpenCoverPicker,
  onOpenGroupTypePicker,
  onOpenGenderPicker,
  onOpenAgePicker,
  onOpenDateTimePicker,
  onOpenLocationPicker,
}: CreateEventFormFieldsProps) => (
  <>
    <Pressable style={styles.coverCard} onPress={onOpenCoverPicker} accessibilityRole="button">
      <Image source={{ uri: selectedCoverUri }} style={styles.coverImage} />
      <BlurView intensity={60} tint="dark" style={styles.coverChip}>
        <UploadIcon width={20} height={20} color="white" />
      </BlurView>
    </Pressable>

    <View style={styles.fieldCard}>
      <View style={styles.fieldCardInner}>
        <TextInput
          placeholder="Event Name"
          value={eventName}
          onChangeText={onChangeEventName}
          placeholderTextColor={colors.createTextFaint}
          cursorColor={colors.selectedTextOnDark}
          selectionColor={colors.selectedTextOnDark}
          style={styles.textInput}
        />
        <View style={styles.fieldDivider} />
        <TextInput
          placeholder="Description"
          value={description}
          onChangeText={onChangeDescription}
          placeholderTextColor={colors.createTextFaint}
          cursorColor={colors.selectedTextOnDark}
          selectionColor={colors.selectedTextOnDark}
          style={[styles.textInput, styles.descriptionInput]}
          multiline
          textAlignVertical="top"
        />
      </View>
    </View>

    <View style={styles.fieldCard}>
      <View style={styles.fieldCardInner}>
        <Pressable style={styles.fieldRow} onPress={onOpenGroupTypePicker}>
          <Text style={styles.fieldLabel}>Group Type</Text>
          <View style={styles.fieldValuePill}>
            <Text style={styles.fieldValueText}>{groupTypeLabel}</Text>
          </View>
        </Pressable>
      </View>
    </View>

    <View style={styles.fieldCard}>
      <View style={styles.fieldCardInner}>
        <Pressable style={styles.fieldRow} onPress={onOpenGenderPicker}>
          <Text style={styles.fieldLabel}>Gender</Text>
          <View style={styles.fieldValuePill}>
            <Text style={styles.fieldValueText}>{genderLabel}</Text>
          </View>
        </Pressable>

        <View style={styles.fieldDivider} />

        <Pressable style={styles.fieldRow} onPress={onOpenAgePicker}>
          <Text style={styles.fieldLabel}>Age</Text>
          <View style={styles.fieldValuePill}>
            <Text style={styles.fieldValueText}>{ageLabel}</Text>
          </View>
        </Pressable>
      </View>
    </View>

    <View style={styles.fieldCard}>
      <View style={styles.fieldCardInner}>
        <Pressable style={[styles.fieldRow, styles.dateRow]} onPress={onOpenDateTimePicker}>
          <Text style={styles.fieldLabel}>Date & Time</Text>
          <View style={[styles.fieldValuePill, styles.dateTimeValuePill]}>
            <Text style={[styles.fieldValueText, styles.dateTimeValueText]} numberOfLines={1}>
              {dateTimeLabel}
            </Text>
          </View>
        </Pressable>

        <View style={styles.fieldDivider} />

        <Pressable style={[styles.fieldRow, styles.locationRow]} onPress={onOpenLocationPicker}>
          <Text style={styles.fieldLabel}>Location</Text>
          <View style={[styles.fieldValuePill, styles.locationValuePill]}>
            <Text
              style={[styles.fieldValueText, !selectedLocationLabel && styles.locationPlaceholder]}
              numberOfLines={1}
            >
              {selectedLocationLabel || 'Select Location'}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  </>
);

export default CreateEventFormFields;
