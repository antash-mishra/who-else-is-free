import { CoverPickerContent } from '@components/CoverPickerModal';
import { DescriptionEditorContent } from '@components/DescriptionEditorModal';
import { EventDateTimePickerContent } from '@components/EventDateTimeModal';
import { LocationPickerContent } from '@components/LocationPickerModal';
import { SelectionModalContent } from '@components/SelectionModal';
import { CoverKey } from '@constants/covers';
import {
  GenderOption,
  genderDisplayLabels,
  genderOptions,
  GroupOption,
  groupDisplayLabels,
  groupOptions,
} from '@constants/eventOptions';
import type { PlaceDetail } from '@hooks/usePlacesAutocomplete';

import SignInButtons from '../../components/SignInButtons';

import AgeRangeContent from './AgeRangeContent';

import type { CreateEventSheet } from './useCreateEventSheets';

export const getCreateEventSheetTitle = (sheet: CreateEventSheet | null): string | undefined => {
  switch (sheet) {
    case 'dateTime':
      return 'Date & time';
    case 'cover':
      return 'Cover';
    case 'groupType':
      return 'Group type';
    case 'gender':
      return 'Gender';
    case 'age':
      return 'Age';
    case 'location':
      return 'Location';
    case 'description':
      return 'Details';
    default:
      return undefined;
  }
};

type CreateEventSheetContentProps = {
  renderedSheet: CreateEventSheet | null;
  activeSheet: CreateEventSheet | null;
  isSheetReady: boolean;
  selectedDateTime: Date;
  pickerMinDate: Date;
  pickerMaxDate: Date;
  onConfirmDateTime: (value: Date) => void;
  coverKey: CoverKey;
  onPickCover?: () => void;
  coverPickerError?: string | null;
  isPickingCover?: boolean;
  onSelectCover: (key: CoverKey) => void;
  tempGroupType: GroupOption;
  onSelectTempGroupType: (value: GroupOption) => void;
  onConfirmGroupType: () => void;
  tempGender: GenderOption;
  onSelectTempGender: (value: GenderOption) => void;
  onConfirmGender: () => void;
  tempAgeGroupIds?: string[];
  tempAgeRange: [number, number];
  onSelectTempAgeRange: (value: [number, number]) => void;
  onConfirmAge: (range: [number, number]) => void;
  ageSelectionMode?: 'range';
  savedAgeRange: [number, number];
  hasCustomCover: boolean;
  selectedLocationLabel: string;
  countryCode: string | null;
  onSelectLocation: (place: PlaceDetail) => void;
  description: string;
  onDescriptionDone: (text: string) => void;
  onClose: () => void;
};

/** Content switch for the Create/Edit Event bottom sheet, keyed by the rendered sheet. */
const CreateEventSheetContent = ({
  renderedSheet,
  activeSheet,
  isSheetReady,
  selectedDateTime,
  pickerMinDate,
  pickerMaxDate,
  onConfirmDateTime,
  coverKey,
  onPickCover,
  coverPickerError,
  isPickingCover,
  onSelectCover,
  tempGroupType,
  onSelectTempGroupType,
  onConfirmGroupType,
  tempGender,
  onSelectTempGender,
  onConfirmGender,
  tempAgeGroupIds,
  onConfirmAge,
  ageSelectionMode,
  savedAgeRange,
  hasCustomCover,
  selectedLocationLabel,
  countryCode,
  onSelectLocation,
  description,
  onDescriptionDone,
  onClose,
}: CreateEventSheetContentProps) => {
  switch (renderedSheet) {
    case 'dateTime':
      return (
        <EventDateTimePickerContent
          visible={activeSheet === 'dateTime'}
          value={selectedDateTime}
          minDate={pickerMinDate}
          maxDate={pickerMaxDate}
          onConfirm={onConfirmDateTime}
        />
      );
    case 'cover':
      return (
        <CoverPickerContent
          selectedCoverKey={hasCustomCover ? undefined : coverKey}
          onSelect={onSelectCover}
          onPickPhoto={onPickCover}
          isPickingPhoto={isPickingCover}
          pickerError={coverPickerError}
          isReady={isSheetReady}
        />
      );
    case 'groupType':
      return (
        <SelectionModalContent
          options={groupOptions}
          selectedValue={tempGroupType}
          onSelect={onSelectTempGroupType}
          onConfirm={onConfirmGroupType}
          getLabel={(opt) => groupDisplayLabels[opt]}
          getKey={(opt) => opt}
          isSelected={(opt, sel) => opt === sel}
        />
      );
    case 'gender':
      return (
        <SelectionModalContent
          options={genderOptions}
          selectedValue={tempGender}
          onSelect={onSelectTempGender}
          onConfirm={onConfirmGender}
          getLabel={(opt) => genderDisplayLabels[opt]}
          getKey={(opt) => opt}
          isSelected={(opt, sel) => opt === sel}
        />
      );
    case 'age':
      return (
        <AgeRangeContent
          visible={activeSheet === 'age'}
          range={savedAgeRange}
          mode={ageSelectionMode}
          ids={tempAgeGroupIds}
          onConfirm={onConfirmAge}
        />
      );
    case 'location':
      return (
        <LocationPickerContent
          visible={activeSheet === 'location'}
          isSheetReady={isSheetReady}
          onClose={onClose}
          onSelect={onSelectLocation}
          initialQuery={selectedLocationLabel}
          countryCode={countryCode}
        />
      );
    case 'description':
      return (
        <DescriptionEditorContent
          visible={activeSheet === 'description'}
          isSheetReady={isSheetReady}
          initialValue={description}
          onDone={onDescriptionDone}
        />
      );
    case 'signIn':
      return <SignInButtons />;
    default:
      return null;
  }
};

export default CreateEventSheetContent;
