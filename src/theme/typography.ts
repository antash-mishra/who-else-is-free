import { Platform } from 'react-native';

export const typography = {
  fontFamilyRegular: 'Inter_400Regular',
  fontFamilyMedium: 'Inter_500Medium',
  fontFamilySemiBold: 'Inter_600SemiBold',
  fontFamilyBold: 'Inter_700Bold',
  titleLineHeight: 36,
  lineHeight: 30,
  letterSpacing: -0.5,
  detailLetterSpacing: -0.3,
  // Android applies negative letter spacing symmetrically around glyphs, so
  // the first character of a placeholder shifts left under the caret. Text
  // inputs therefore use no tracking on Android.
  inputLetterSpacing: Platform.OS === 'android' ? 0 : -0.5,
  inputDetailLetterSpacing: Platform.OS === 'android' ? 0 : -0.3,
  header: 24,
  title: 22,
  subtitle: 18,
  body: 16,
  caption: 14,
  small: 12,
  cardTitle: 16,
  cardMeta: 14
} as const;
