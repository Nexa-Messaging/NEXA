import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  ReportCategory,
} from '@/lib/moderation';

export interface ReportSheetProps {
  visible: boolean;
  /** Header title, e.g. "Report message" or "Report user". */
  title: string;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (category: ReportCategory, details?: string) => void;
}

/**
 * Bottom sheet for filing a moderation report: a fixed category list plus an
 * optional free-text detail field.
 */
export function ReportSheet({
  visible,
  title,
  submitting = false,
  error,
  onClose,
  onSubmit,
}: ReportSheetProps) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState('');

  const reset = () => {
    setCategory(null);
    setDetails('');
  };

  const submit = () => {
    if (!category || submitting) {
      return;
    }
    onSubmit(category, details.trim() || undefined);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.backdrop}
        onPress={() => {
          reset();
          onClose();
        }}
      >
        <Pressable style={styles.sheet} onPress={() => {}}>
          <AppText variant="label" weight="semibold" color={colors.textSecondary} align="center">
            {title.toUpperCase()}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} align="center" style={styles.hint}>
            Our team reviews every report. Choose the closest category.
          </AppText>

          <ScrollView style={styles.categories} contentContainerStyle={styles.categoriesContent}>
            {REPORT_CATEGORIES.map((item) => {
              const selected = category === item;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  style={[styles.category, selected && styles.categorySelected]}
                  onPress={() => setCategory(item)}
                >
                  <View
                    style={[styles.radio, selected && styles.radioSelected]}
                    testID={`report-category-${item}`}
                  />
                  <AppText
                    variant="body"
                    weight={selected ? 'semibold' : 'regular'}
                    color={selected ? colors.primary : colors.text}
                  >
                    {REPORT_CATEGORY_LABELS[item]}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          <TextInput
            style={styles.details}
            placeholder="Add details (optional)"
            placeholderTextColor={colors.textMuted}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={500}
            editable={!submitting}
          />

          {error ? (
            <AppText variant="caption" color={colors.danger} style={styles.error}>
              {error}
            </AppText>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, styles.cancel]}
              disabled={submitting}
              onPress={() => {
                reset();
                onClose();
              }}
            >
              <AppText variant="body" weight="semibold" color={colors.textSecondary}>
                Cancel
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, styles.submit, !category && styles.buttonDisabled]}
              disabled={!category || submitting}
              onPress={submit}
            >
              <AppText
                variant="body"
                weight="semibold"
                color={!category || submitting ? colors.textMuted : colors.surface}
              >
                {submitting ? 'Submitting…' : 'Submit report'}
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '85%',
  },
  hint: {
    marginTop: spacing.xxs,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
  categories: {
    maxHeight: 300,
  },
  categoriesContent: {
    gap: spacing.xs,
  },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  categorySelected: {
    backgroundColor: colors.primarySoft,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.textMuted,
    marginRight: spacing.sm,
  },
  radioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  details: {
    minHeight: 72,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  error: {
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xxs,
  },
  cancel: {
    backgroundColor: colors.surfaceMuted,
  },
  submit: {
    backgroundColor: colors.danger,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
});
