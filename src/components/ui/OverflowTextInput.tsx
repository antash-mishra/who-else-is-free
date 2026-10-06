import { forwardRef, useState } from 'react';

import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextLayoutEventData,
  View,
} from 'react-native';

import { colors } from '@theme/index';

/** Single-line editor: native horizontal scrolling while focused, ellipsis at rest. */
const OverflowTextInput = forwardRef<TextInput, TextInputProps>(function OverflowTextInput(
  { style, value, onFocus, onBlur, autoFocus, ...props },
  ref,
) {
  const [focused, setFocused] = useState(Boolean(autoFocus));
  const [preview, setPreview] = useState<{ value: string; text: string } | null>(null);
  const measurePreview = ({
    nativeEvent: { lines },
  }: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (!value || !lines.length) return;
    const firstLine = lines[0].text.trimEnd();
    const wordBoundary = firstLine.lastIndexOf(' ');
    // Reserve the last word's space for the ellipsis. Unbroken text uses native truncation.
    const text =
      lines.length > 1 && wordBoundary > 0 ? firstLine.slice(0, wordBoundary) + '…' : value;
    setPreview((previous) =>
      previous?.value === value && previous.text === text ? previous : { value, text },
    );
  };
  const showPreview = !focused && Boolean(value);

  return (
    <View style={styles.container}>
      <TextInput
        {...props}
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        multiline={false}
        style={[style, showPreview && styles.hidden]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {showPreview && (
        <View
          style={styles.preview}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={style} numberOfLines={1} ellipsizeMode="tail" accessible={false}>
            {preview && preview.value === value ? preview.text : value}
          </Text>
          <Text style={[style, styles.measure]} onTextLayout={measurePreview} accessible={false}>
            {value}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', minWidth: 0 },
  // Keep alpha above UIKit's 0.01 hit-testing cutoff while suppressing cached editor paint.
  hidden: { color: colors.transparent, opacity: 0.02 },
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  preview: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
});

export default OverflowTextInput;
