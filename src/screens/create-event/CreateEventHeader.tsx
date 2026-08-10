import { Pressable, Text, View } from 'react-native';

import CloseIcon from '@assets/ui/close.svg';
import { triggerHaptic } from '@services/haptics';
import { colors } from '@theme/index';

import styles from '../CreateEventScreen.styles';

type CreateEventHeaderProps = {
  isEditing: boolean;
  onClose: () => void;
};

/** Fixed Create/Edit Event header: centered title plus close button. */
const CreateEventHeader = ({ isEditing, onClose }: CreateEventHeaderProps) => (
  <View style={styles.headerRow}>
    <View style={styles.headerSpacer} />
    <Text style={styles.pageTitle}>{isEditing ? 'Edit plan' : 'Create plan'}</Text>
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        triggerHaptic('light');
        onClose();
      }}
      style={styles.dismissButton}
    >
      <CloseIcon width={24} height={24} color={colors.createTextPrimary} />
    </Pressable>
  </View>
);

export default CreateEventHeader;
