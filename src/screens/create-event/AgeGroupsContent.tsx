import { SelectionModalContent } from '@components/SelectionModal';
import { ageOptions } from '@constants/eventOptions';
import { toggleAgeGroup } from '@utils/ageGroups';

interface Props {
  ids?: string[];
  legacyRange: [number, number];
  onChange: (ids: string[]) => void;
  onConfirm: () => void;
}

export default function AgeGroupsContent({ ids, legacyRange, onChange, onConfirm }: Props) {
  return (
    <SelectionModalContent
      options={ageOptions}
      selectedValue={ids}
      onSelect={(option) => onChange(toggleAgeGroup(ids ?? [], option.id))}
      onConfirm={onConfirm}
      getLabel={(option) => option.label}
      getKey={(option) => option.id}
      isSelected={(option, selected) => selected?.includes(option.id) ?? false}
      confirmDisabled={ids?.length === 0}
      helperText={
        !ids
          ? `Current range: ${legacyRange[0]}-${legacyRange[1]}`
          : ids.length === 0
            ? 'Select at least one age group.'
            : undefined
      }
    />
  );
}
