import React, { useEffect, useRef, useState } from 'react';

import { StyleSheet, Text, TextInput, View } from 'react-native';

import ScalePressable from '@components/ScalePressable';
import { colors, spacing, typography } from '@theme/index';

export type DescriptionEditorProps = {
  visible: boolean;
  /** Current committed description; seeds the local draft each time the sheet opens. */
  initialValue: string;
  /** Commit the draft and close. Only fired from "Done". */
  onDone: (text: string) => void;
};

/**
 * Full-sheet editor for the event description. Edits are held in a LOCAL draft
 * seeded from `initialValue` when the sheet opens, so dismissing without "Done"
 * (swipe / backdrop) discards them. Autofocuses once the open animation settles.
 */
export const DescriptionEditorContent = ({
  visible,
  initialValue,
  onDone,
}: DescriptionEditorProps) => {
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraft(initialValue);
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [visible, initialValue]);

  const handleClear = () => {
    setDraft('');
    inputRef.current?.focus();
  };

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        placeholder="Write a description"
        placeholderTextColor={colors.subText}
        multiline
        textAlignVertical="top"
        underlineColorAndroid="transparent"
      />
      <View style={styles.footer}>
        <ScalePressable
          haptic="light"
          onPress={handleClear}
          disabled={draft.length === 0}
          style={styles.clearButton}
          accessibilityRole="button"
          accessibilityLabel="Clear description"
        >
          <Text style={[styles.clearText, draft.length === 0 && styles.clearTextDisabled]}>
            Clear
          </Text>
        </ScalePressable>
        <ScalePressable
          haptic="light"
          onPress={() => onDone(draft)}
          style={styles.doneButton}
          accessibilityRole="button"
          accessibilityLabel="Done editing description"
        >
          <Text style={styles.doneText}>Done</Text>
        </ScalePressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // No horizontal padding: the sheet container already insets by spacing.md,
    // so the input and Done button align with the "Description" title's edges.
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    lineHeight: 22,
    letterSpacing: -0.3,
    paddingTop: 0,
  },
  footer: {
    gap: spacing.xs,
  },
  // Ghost secondary button: no background, sits above Done.
  clearButton: {
    height: 48,
    borderRadius: 999,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.subText, // grey — secondary to the filled Done button
  },
  clearTextDisabled: {
    opacity: 0.4,
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
  },
});

export default DescriptionEditorContent;
