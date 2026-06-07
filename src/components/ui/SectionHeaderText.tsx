import { memo } from 'react';
import { StyleProp, TextStyle } from 'react-native';

import { typography } from '@theme/index';

import AppText from './AppText';

interface SectionHeaderTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
}

const SectionHeaderText = ({ children, style }: SectionHeaderTextProps) => (
  <AppText
    variant="body"
    style={[
      {
        fontFamily: typography.fontFamilyMedium,
        letterSpacing: typography.detailLetterSpacing,
      },
      style,
    ]}
  >
    {children}
  </AppText>
);

export default memo(SectionHeaderText);
