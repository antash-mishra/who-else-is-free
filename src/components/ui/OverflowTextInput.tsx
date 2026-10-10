import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { Platform, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors } from '@theme/index';

/** Single-line editor: native horizontal scrolling while focused, ellipsis at rest. */
const OverflowTextInput = forwardRef<TextInput, TextInputProps>(function OverflowTextInput(
  { style, value, onFocus, onBlur, autoFocus, ...props },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput);
  const [focused, setFocused] = useState(Boolean(autoFocus));
  const showPreview = !focused && Boolean(value);

  useEffect(() => {
    // Android's hidden editor keeps its last horizontal scroll (usually the end of a long
    // value). Rewind it so a tap lands on the text the preview shows instead of jumping.
    if (Platform.OS === 'android' && showPreview) inputRef.current?.setSelection(0, 0);
  }, [showPreview, value]);

  return (
    <View style={styles.container}>
      <TextInput
        {...props}
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        multiline={false}
        style={[styles.input, style, showPreview && styles.hidden]}
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
            {value}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', minWidth: 0 },
  // Android's EditText theme adds horizontal padding the preview Text lacks, so focusing
  // nudged the text sideways. Lowest-specificity reset: callers' paddings still win.
  input: Platform.select({ android: { padding: 0 }, default: {} }),
  // Keep alpha above UIKit's 0.01 hit-testing cutoff while suppressing cached editor paint.
  hidden: { color: colors.transparent, opacity: 0.02 },
  preview: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
});

export default OverflowTextInput;
