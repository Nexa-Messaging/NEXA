import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, AppButton, FormField, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { createCommunityPoll } from '@/lib/polls';

const EXPIRY_CHOICES: { label: string; ms: number | null }[] = [
  { label: 'No deadline', ms: null },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
];

const MAX_OPTIONS = 10;

export default function NewPollScreen() {
  const params = useLocalSearchParams<{ communityId: string }>();
  const communityId = params.communityId;

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [anonymous, setAnonymous] = useState(false);
  const [expiryMs, setExpiryMs] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [optionErrors, setOptionErrors] = useState<(string | null)[]>([null, null]);

  const updateOption = (index: number, value: string) => {
    setOptions((current) => current.map((item, i) => (i === index ? value : item)));
    setOptionErrors((current) => current.map((item, i) => (i === index ? null : item)));
  };

  const addOption = () => {
    setOptions((current) => (current.length >= MAX_OPTIONS ? current : [...current, '']));
    setOptionErrors((current) => [...current, null]);
  };

  const removeOption = (index: number) => {
    setOptions((current) => current.filter((_, i) => i !== index));
    setOptionErrors((current) => current.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((item) => item.trim());
    const nextQuestionError = trimmedQuestion
      ? null
      : 'Ask a question your community can answer.';
    const nextOptionErrors: (string | null)[] = trimmedOptions.map((item) =>
      item ? null : 'Every option needs some text.',
    );
    if (trimmedOptions.filter((item) => item).length < 2) {
      const firstEmpty = nextOptionErrors.findIndex((item) => item !== null);
      nextOptionErrors[firstEmpty >= 0 ? firstEmpty : 0] = 'Add at least two options.';
    }
    const seen = new Set<string>();
    let duplicate = false;
    for (const item of trimmedOptions.filter((item) => item)) {
      if (seen.has(item)) {
        duplicate = true;
        break;
      }
      seen.add(item);
    }
    if (duplicate) {
      if (!nextQuestionError) {
        setError('Options must be unique.');
      }
    }
    setQuestionError(nextQuestionError);
    setOptionErrors(nextOptionErrors);
    return !nextQuestionError && nextOptionErrors.every((item) => item === null) && !duplicate;
  };

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }
    Keyboard.dismiss();
    if (!validate()) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createCommunityPoll(
      communityId,
      question.trim(),
      options.map((item) => item.trim()).filter((item) => item),
      anonymous,
      expiryMs ? new Date(Date.now() + expiryMs).toISOString() : undefined,
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.back();
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={12} style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold" style={styles.headerTitle}>
          New poll
        </AppText>
      </View>

      <FormField
        label="Question"
        placeholder="What should the community decide?"
        value={question}
        onChangeText={setQuestion}
        maxLength={200}
        error={questionError}
      />

      <AppText variant="label" weight="medium" color={colors.textSecondary} style={styles.optionsLabel}>
        Options
      </AppText>
      {options.map((option, index) => (
        <View key={index} style={styles.optionRow}>
          <FormField
            label={`Option ${index + 1}`}
            placeholder={
              index === 0
                ? 'First option'
                : index === 1
                  ? 'Second option'
                  : `Option ${index + 1}`
            }
            value={option}
            onChangeText={(value) => updateOption(index, value)}
            maxLength={80}
            error={optionErrors[index]}
            style={styles.optionField}
          />
          {options.length > 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove option ${index + 1}`}
              hitSlop={8}
              style={styles.removeButton}
              onPress={() => removeOption(index)}
            >
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {options.length < MAX_OPTIONS ? (
        <Pressable
          accessibilityRole="button"
          onPress={addOption}
          style={styles.addOption}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <AppText variant="label" color={colors.primary} weight="semibold">
            Add option
          </AppText>
        </Pressable>
      ) : null}

      <AppText variant="label" weight="medium" color={colors.textSecondary} style={styles.sectionLabel}>
        Who can see each vote?
      </AppText>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: anonymous }}
        onPress={() => setAnonymous((value) => !value)}
        style={styles.toggleRow}
      >
        <Ionicons
          name={anonymous ? 'radio-button-on' : 'radio-button-off'}
          size={22}
          color={anonymous ? colors.primary : colors.textMuted}
        />
        <View style={styles.toggleText}>
          <AppText variant="body" weight="semibold">
            Anonymous poll
          </AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            Only you and admins see who voted; everyone sees the tallies.
          </AppText>
        </View>
      </Pressable>

      <AppText variant="label" weight="medium" color={colors.textSecondary} style={styles.sectionLabel}>
        Close after
      </AppText>
      <View style={styles.chipRow}>
        {EXPIRY_CHOICES.map((choice) => {
          const active = choice.ms === expiryMs;
          return (
            <Pressable
              key={choice.label}
              accessibilityRole="button"
              onPress={() => setExpiryMs(choice.ms)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <AppText
                variant="caption"
                weight={active ? 'bold' : 'semibold'}
                color={active ? colors.surface : colors.textSecondary}
              >
                {choice.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <AppText variant="label" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <AppButton
        title="Create poll"
        fullWidth
        loading={submitting}
        disabled={submitting || !communityId}
        onPress={() => void handleSubmit()}
        style={styles.submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginRight: 40,
  },
  optionsLabel: {
    marginBottom: spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  optionField: {
    flex: 1,
  },
  removeButton: {
    paddingTop: 42,
    paddingLeft: spacing.sm,
  },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  sectionLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  toggleText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  error: {
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  submit: {
    marginTop: spacing.lg,
  },
});