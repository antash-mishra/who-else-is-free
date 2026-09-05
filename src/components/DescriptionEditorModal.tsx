import React, { useEffect, useRef, useState } from 'react';

import { StyleSheet, Text, TextInput, View } from 'react-native';

import ScalePressable from '@components/ScalePressable';
import { colors, spacing, typography } from '@theme/index';

export type DescriptionEditorProps = {
  visible: boolean;
  /** True once the containing sheet has settled and can safely summon the keyboard. */
  isSheetReady?: boolean;
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
  isSheetReady = visible,
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
  }, [visible, initialValue]);

  useEffect(() => {
    if (!visible || !isSheetReady) {
      return undefined;
    }

    const timer = setTimeout(() => inputRef.current?.focus(), 16);
    return () => clearTimeout(timer);
  }, [isSheetReady, visible]);

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        placeholder="Add details"
        placeholderTextColor={colors.subText}
        multiline
        textAlignVertical="top"
        underlineColorAndroid="transparent"
      />
      <View style={styles.footer}>
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
    letterSpacing: typography.inputDetailLetterSpacing,
    paddingTop: 0,
  },
  footer: {
    width: '100%',
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
