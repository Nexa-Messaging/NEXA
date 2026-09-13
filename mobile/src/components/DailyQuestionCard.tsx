import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import { gradients, radius, shadows, spacing, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { DailyQuestion, DailyAnswer, ANSWER_REACTIONS } from '@/lib/dailyQuestions';

interface DailyQuestionCardProps {
  question: DailyQuestion;
  myAnswer: DailyAnswer | null;
  answers: DailyAnswer[];
  stats: { total_answers: number; total_reactions: number; total_skips: number } | null;
  onSubmit: (answer: string, isPublic: boolean) => Promise<void>;
  onReact: (answerId: string, emoji: string) => Promise<void>;
  onUnreact: (answerId: string, emoji: string) => Promise<void>;
  onSkip: () => Promise<void>;
  onShare: (answer: DailyAnswer) => void;
  submitting: boolean;
  loadingReactions: Set<string>;
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.xl,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      ...shadows.card,
    },
    header: {
      padding: spacing.lg,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    dayBadge: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
    },
    questionWrapper: {
      gap: spacing.xs,
    },
    categoryTag: {
      backgroundColor: 'rgba(255,255,255,0.15)',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      alignSelf: 'flex-start',
      fontSize: typography.caption,
    },
    questionText: {
      fontSize: typography.title,
      lineHeight: typography.title * 1.3,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.2)',
    },
    stat: {
      alignItems: 'center',
    },
    content: {
      padding: spacing.lg,
      gap: spacing.lg,
    },
    myAnswerCard: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.sm,
    },
    myAnswerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    myAnswerText: {
      lineHeight: 22,
    },
    myAnswerMeta: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    answerInputWrapper: {
      gap: spacing.md,
    },
    sectionLabel: {
      marginBottom: spacing.xs,
    },
    textInput: {
      borderRadius: radius.md,
      padding: spacing.md,
      fontSize: typography.body,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    inputFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    visibilityToggle: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    answersSection: {
      gap: spacing.md,
    },
    answersList: {
      gap: spacing.md,
    },
    answerCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    answerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    answerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    answerInfo: {
      flex: 1,
    },
    answerText: {
      lineHeight: 22,
      marginTop: spacing.xs,
    },
    expandHint: {
      marginTop: spacing.xs,
      textAlign: 'right',
    },
    reactionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    reactionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    reactionPillActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    addReactionPill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    answerActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.md,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    actionBtn: {
      paddingVertical: 2,
    },
    reactionPicker: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    reactionPickerItem: {
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actions: {
      marginTop: spacing.md,
    },
  });
}

export function DailyQuestionCard({
  question,
  myAnswer,
  answers,
  stats,
  onSubmit,
  onReact,
  onUnreact,
  onSkip,
  onShare,
  submitting,
  loadingReactions,
}: DailyQuestionCardProps) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [answerText, setAnswerText] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [showAnswerInput, setShowAnswerInput] = useState(false);
  const [expandedAnswerId, setExpandedAnswerId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!answerText.trim()) return;
    await onSubmit(answerText.trim(), isPublic);
    setAnswerText('');
    setShowAnswerInput(false);
  };

  const toggleReaction = async (answerId: string, emoji: string) => {
    const answer = answers.find(a => a.id === answerId);
    if (!answer) return;
    const hasReacted = answer.my_reactions.includes(emoji);
    if (hasReacted) {
      await onUnreact(answerId, emoji);
    } else {
      await onReact(answerId, emoji);
    }
  };

  const categoryEmoji = {
    general: '💭',
    fun: '😄',
    deep: '🧠',
    hypothetical: '🌌',
    lifestyle: '🌿',
  }[question.category] ?? '💭';

  return (
    <View style={styles.card}>
      {/* Question Header */}
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <AppText variant="caption" weight="bold" color={colors.headerText} style={styles.dayBadge}>
            DAILY QUESTION
          </AppText>
          <AppText variant="caption" color={colors.headerText} style={{ opacity: 0.9 }}>
            {new Date(question.scheduled_date ?? Date.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </AppText>
        </View>

        <View style={styles.questionWrapper}>
          <AppText variant="body" style={styles.categoryTag} color={colors.headerText}>
            {categoryEmoji} {question.category.charAt(0).toUpperCase() + question.category.slice(1)}
          </AppText>
          <AppText variant="heading" weight="bold" color={colors.headerText} style={styles.questionText}>
            {question.text}
          </AppText>
        </View>

        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <AppText variant="caption" weight="bold" color={colors.headerText}>{stats.total_answers.toLocaleString()}</AppText>
              <AppText variant="caption" color={colors.headerText} style={{ opacity: 0.8 }}>Answers</AppText>
            </View>
            <View style={styles.stat}>
              <AppText variant="caption" weight="bold" color={colors.headerText}>{stats.total_reactions.toLocaleString()}</AppText>
              <AppText variant="caption" color={colors.headerText} style={{ opacity: 0.8 }}>Reactions</AppText>
            </View>
            <View style={styles.stat}>
              <AppText variant="caption" weight="bold" color={colors.headerText}>{stats.total_skips.toLocaleString()}</AppText>
              <AppText variant="caption" color={colors.headerText} style={{ opacity: 0.8 }}>Skips</AppText>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* Answer Section */}
      <View style={styles.content}>
        {myAnswer && !showAnswerInput ? (
          <View style={styles.myAnswerCard}>
            <View style={styles.myAnswerHeader}>
              <AppText variant="label" weight="bold" color={colors.textSecondary}>YOUR ANSWER</AppText>
              <AppButton
                title="Edit"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setAnswerText(myAnswer.answer);
                  setIsPublic(myAnswer.is_public);
                  setShowAnswerInput(true);
                }}
              />
            </View>
            <AppText variant="body" color={colors.text} style={styles.myAnswerText}>
              {myAnswer.answer}
            </AppText>
            <View style={styles.myAnswerMeta}>
              <AppText variant="caption" tone="secondary">
                {myAnswer.is_public ? '🌍 Public' : '🔒 Private'}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {new Date(myAnswer.created_at).toLocaleDateString()}
              </AppText>
            </View>
          </View>
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.answerInputWrapper}
            keyboardVerticalOffset={0}
          >
            <AppText variant="label" weight="bold" color={colors.textSecondary} style={styles.sectionLabel}>
              YOUR ANSWER
            </AppText>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.inputBg }]}
              value={answerText}
              onChangeText={setAnswerText}
              placeholder="Share your thoughts..."
              multiline
              numberOfLines={4}
              maxLength={2000}
              autoCapitalize="sentences"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.inputFooter}>
              <View style={styles.visibilityToggle}>
                <AppText variant="caption" color={colors.textSecondary}>Public</AppText>
                <AppText variant="caption" color={colors.textSecondary}>Private</AppText>
              </View>
              <AppButton
                title="Submit"
                variant="gradient"
                size="md"
                loading={submitting}
                onPress={handleSubmit}
              />
            </View>
          </KeyboardAvoidingView>
        )}

        {answers.length > 0 && (
          <View style={styles.answersSection}>
            <AppText variant="label" weight="bold" color={colors.textSecondary} style={styles.sectionLabel}>
              COMMUNITY ANSWERS ({answers.length})
            </AppText>
            <View style={styles.answersList}>
              {answers.map(answer => (
                <AnswerCard
                  key={answer.id}
                  answer={answer}
                  isExpanded={expandedAnswerId === answer.id}
                  onToggleExpand={() => setExpandedAnswerId(expandedAnswerId === answer.id ? null : answer.id)}
                  onReact={toggleReaction}
                  onShare={() => onShare(answer)}
                  loading={loadingReactions.has(answer.id)}
                  colors={colors}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          {!myAnswer ? (
            <AppButton
              title="Skip for today"
              variant="outline"
              size="md"
              fullWidth
              onPress={onSkip}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function AnswerCard({
  answer,
  isExpanded,
  onToggleExpand,
  onReact,
  onShare,
  loading,
  colors,
}: {
  answer: DailyAnswer;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onReact: (answerId: string, emoji: string) => Promise<void>;
  onShare: () => void;
  loading: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  const [showReactions, setShowReactions] = useState(false);

  const reactionEntries = Object.entries(answer.reactions ?? {});
  const answerCardStyles = createStyles(colors);

  return (
    <Pressable
      style={answerCardStyles.answerCard}
      onPress={onToggleExpand}
      onLongPress={() => setShowReactions(true)}
    >
      <View style={answerCardStyles.answerHeader}>
        <View style={answerCardStyles.answerAvatar}>
          <AppText variant="heading" weight="bold" color={colors.primary}>
            {answer.display_name.charAt(0).toUpperCase()}
          </AppText>
        </View>
        <View style={answerCardStyles.answerInfo}>
          <AppText variant="body" weight="bold">{answer.display_name}</AppText>
          <AppText variant="caption" tone="secondary">@{answer.username} • {new Date(answer.created_at).toLocaleDateString()}</AppText>
        </View>
      </View>

      <AppText variant="body" color={colors.text} style={answerCardStyles.answerText} numberOfLines={isExpanded ? 99 : 3}>
        {answer.answer}
      </AppText>

      {!isExpanded && answer.answer.length > 150 && (
        <AppText variant="caption" color={colors.primary} weight="semibold" style={answerCardStyles.expandHint}>
          Tap to expand
        </AppText>
      )}

      {reactionEntries.length > 0 && (
        <View style={answerCardStyles.reactionsRow}>
          {reactionEntries.map(([emoji, count]) => {
            const hasReacted = answer.my_reactions.includes(emoji);
            return (
              <Pressable
                key={emoji}
                style={[
                  answerCardStyles.reactionPill,
                  hasReacted && answerCardStyles.reactionPillActive,
                ]}
                onPress={() => onReact(answer.id, emoji)}
                disabled={loading}
              >
                <AppText variant="caption" style={{ fontSize: 14 }}>{emoji}</AppText>
                <AppText
                  variant="caption"
                  weight={hasReacted ? 'bold' : 'regular'}
                  color={hasReacted ? colors.primary : colors.textSecondary}
                >
                  {count}
                </AppText>
              </Pressable>
            );
          })}
          <Pressable
            style={answerCardStyles.addReactionPill}
            onPress={() => setShowReactions(true)}
          >
            <AppText variant="caption">+</AppText>
          </Pressable>
        </View>
      )}

      <View style={answerCardStyles.answerActions}>
        <Pressable style={answerCardStyles.actionBtn} onPress={onShare}>
          <AppText variant="caption" color={colors.textSecondary}>Share</AppText>
        </Pressable>
        <Pressable style={answerCardStyles.actionBtn} onPress={() => setShowReactions(true)}>
          <AppText variant="caption" color={colors.textSecondary}>React</AppText>
        </Pressable>
      </View>

      {showReactions && (
        <View style={answerCardStyles.reactionPicker}>
          {ANSWER_REACTIONS.map(emoji => (
            <Pressable
              key={emoji}
              style={answerCardStyles.reactionPickerItem}
              onPress={() => {
                onReact(answer.id, emoji);
                setShowReactions(false);
              }}
            >
              <AppText variant="body" style={{ fontSize: 24 }}>{emoji}</AppText>
            </Pressable>
          ))}
          <Pressable style={answerCardStyles.reactionPickerItem} onPress={() => setShowReactions(false)}>
            <AppText variant="caption" color={colors.textSecondary}>Cancel</AppText>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}