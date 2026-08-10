import { CoverPickerContent } from '@components/CoverPickerModal';
import { DescriptionEditorContent } from '@components/DescriptionEditorModal';
import { EventDateTimePickerContent } from '@components/EventDateTimeModal';
import { LocationPickerContent } from '@components/LocationPickerModal';
import { SelectionModalContent } from '@components/SelectionModal';
import { CoverKey } from '@constants/covers';
import {
  AgeOption,
  ageOptions,
  GenderOption,
  genderDisplayLabels,
  genderOptions,
  GroupOption,
  groupDisplayLabels,
  groupOptions,
} from '@constants/eventOptions';
import type { PlaceDetail } from '@hooks/usePlacesAutocomplete';

import SignInButtons from '../../components/SignInButtons';

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
  selectedDateTime: Date;
  pickerMinDate: Date;
  pickerMaxDate: Date;
  onConfirmDateTime: (value: Date) => void;
  coverKey: CoverKey;
  onSelectCover: (key: CoverKey) => void;
  tempGroupType: GroupOption;
  onSelectTempGroupType: (value: GroupOption) => void;
  onConfirmGroupType: () => void;
  tempGender: GenderOption;
  onSelectTempGender: (value: GenderOption) => void;
  onConfirmGender: () => void;
  tempAgeRange: [number, number];
  onSelectTempAgeRange: (value: [number, number]) => void;
  onConfirmAge: () => void;
  selectedLocationLabel: string;
  onSelectLocation: (place: PlaceDetail) => void;
  description: string;
  onDescriptionDone: (text: string) => void;
  onClose: () => void;
};

/** Content switch for the Create/Edit Event bottom sheet, keyed by the rendered sheet. */
const CreateEventSheetContent = ({
  renderedSheet,
  activeSheet,
  selectedDateTime,
  pickerMinDate,
  pickerMaxDate,
  onConfirmDateTime,
  coverKey,
  onSelectCover,
  tempGroupType,
  onSelectTempGroupType,
  onConfirmGroupType,
  tempGender,
  onSelectTempGender,
  onConfirmGender,
  tempAgeRange,
  onSelectTempAgeRange,
  onConfirmAge,
  selectedLocationLabel,
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
      return <CoverPickerContent selectedCoverKey={coverKey} onSelect={onSelectCover} />;
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
        <SelectionModalContent<AgeOption>
          options={ageOptions}
          selectedValue={{ label: '', min: tempAgeRange[0], max: tempAgeRange[1] }}
          onSelect={(opt) => onSelectTempAgeRange([opt.min, opt.max])}
          onConfirm={onConfirmAge}
          getLabel={(opt) => opt.label}
          getKey={(opt) => opt.label}
          isSelected={(opt, sel) => opt.min === sel.min && opt.max === sel.max}
        />
      );
    case 'location':
      return (
        <LocationPickerContent
          visible={activeSheet === 'location'}
          onClose={onClose}
          onSelect={onSelectLocation}
          initialQuery={selectedLocationLabel}
        />
      );
    case 'description':
      return (
        <DescriptionEditorContent
          visible={activeSheet === 'description'}
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
