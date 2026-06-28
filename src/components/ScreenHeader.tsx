import { StyleSheet, Text, View } from 'react-native';

import ChevronLeftIcon from '@assets/ui/chevron-left.svg';
import { IconButton } from '@components/ui';
import { colors, layout, typography } from '@theme/index';

interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
}

const ScreenHeader = ({ title, onBack }: ScreenHeaderProps) => (
  <View style={styles.header}>
    <IconButton
      accessibilityLabel="Go back"
      icon={<ChevronLeftIcon width={24} height={24} color={colors.text} />}
      onPress={onBack}
      style={styles.backButton}
    />
    <View style={styles.titleContainer} pointerEvents="none">
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.headerHeight,
  },
  backButton: {
    width: layout.headerHeight,
    height: layout.headerHeight,
    // Pull the button left so the chevron's tip (inset inside its icon)
    // optically aligns with the page text's left margin, not the icon box.
    // Kept on the button (not the header) so the centered title stays
    // centered on the screen.
    marginLeft: -18,
  },
  titleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 22,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    letterSpacing: -0.4,
  },
});

export default ScreenHeader;
