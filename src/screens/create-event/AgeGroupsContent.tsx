import { StyleSheet, View } from 'react-native';

import AppButton from '@components/ui/AppButton';
import AppText from '@components/ui/AppText';
import CheckboxRow from '@components/ui/CheckboxRow';
import { ageOptions } from '@constants/eventOptions';
import { spacing } from '@theme/index';
import { toggleAgeGroup } from '@utils/ageGroups';

interface Props {
  ids?: string[];
  legacyRange: [number, number];
  onChange: (ids: string[]) => void;
  onConfirm: () => void;
}
export default function AgeGroupsContent({ ids, legacyRange, onChange, onConfirm }: Props) {
  return (
    <View style={styles.body}>
      {!ids && (
        <AppText>
          Current range: {legacyRange[0]}-{legacyRange[1]}
        </AppText>
      )}
      {ageOptions.map((option) => {
        const id = option.id;
        return (
          <CheckboxRow
            key={id}
            label={option.label}
            checked={ids?.includes(id) ?? false}
            testID={`age-group-${id}`}
            onPress={() => onChange(toggleAgeGroup(ids ?? [], id))}
          />
        );
      })}
      {ids?.length === 0 && <AppText>Select at least one age group.</AppText>}
      <AppButton
        label="Done"
        testID="selection-modal-confirm"
        disabled={ids?.length === 0}
        onPress={onConfirm}
      />
    </View>
  );
}
const styles = StyleSheet.create({ body: { gap: spacing.md } });
