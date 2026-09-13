import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { DailyQuestionCard } from '@/components/DailyQuestionCard';
import { AppText, Card, Screen } from '@/components/ui';
import { gradients, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  fetchTodayQuestion,
  fetchMyAnswer,
  fetchDailyAnswers,
  fetchDailyQuestionStats,
  submitDailyAnswer,
  reactToDailyAnswer,
  unreactToDailyAnswer,
  skipDailyQuestion,
  DailyQuestion,
  DailyAnswer,
} from '@/lib/dailyQuestions';

export default function DailyQuestionScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [myAnswer, setMyAnswer] = useState<DailyAnswer | null>(null);
  const [answers, setAnswers] = useState<DailyAnswer[]>([]);
  const [stats, setStats] = useState<{ total_answers: number; total_reactions: number; total_skips: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingReactions, setLoadingReactions] = useState<Set<string>>(new Set());

  const loadData = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const qRes = await fetchTodayQuestion();
    if (qRes.data) {
      setQuestion(qRes.data);
      const [myAnsRes, answersRes, statsRes] = await Promise.all([
        fetchMyAnswer(qRes.data.id),
        fetchDailyAnswers(qRes.data.id, 50),
        fetchDailyQuestionStats(qRes.data.id),
      ]);
      if (myAnsRes.data) setMyAnswer(myAnsRes.data);
      if (answersRes.data) setAnswers(answersRes.data);
      if (statsRes.data) setStats(statsRes.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSubmit = async (answer: string, isPublic: boolean) => {
    if (!question) return;
    setSubmitting(true);
    const res = await submitDailyAnswer(question.id, answer, isPublic);
    if (res.error) {
      Alert.alert('Error', res.error);
    } else {
      setMyAnswer(res.data);
      // Refresh answers list
      const answersRes = await fetchDailyAnswers(question.id, 50);
      if (answersRes.data) setAnswers(answersRes.data);
      const statsRes = await fetchDailyQuestionStats(question.id);
      if (statsRes.data) setStats(statsRes.data);
    }
    setSubmitting(false);
  };

  const handleReact = async (answerId: string, emoji: string) => {
    setLoadingReactions(prev => new Set([...prev, answerId]));
    const res = await reactToDailyAnswer(answerId, emoji);
    if (res.error) {
      Alert.alert('Error', res.error);
    } else {
      // Optimistic update
      setAnswers(prev => prev.map(a => {
        if (a.id !== answerId) return a;
        const myReactions = a.my_reactions.includes(emoji)
          ? a.my_reactions.filter(e => e !== emoji)
          : [...a.my_reactions, emoji];
        const reactions = { ...a.reactions };
        reactions[emoji] = (reactions[emoji] ?? 0) + (a.my_reactions.includes(emoji) ? -1 : 1);
        if (reactions[emoji] <= 0) delete reactions[emoji];
        return { ...a, my_reactions: myReactions, reactions };
      }));
    }
    setLoadingReactions(prev => {
      const next = new Set(prev);
      next.delete(answerId);
      return next;
    });
  };

  const handleUnreact = async (answerId: string, emoji: string) => {
    setLoadingReactions(prev => new Set([...prev, answerId]));
    const res = await unreactToDailyAnswer(answerId, emoji);
    if (res.error) {
      Alert.alert('Error', res.error);
    } else {
      setAnswers(prev => prev.map(a => {
        if (a.id !== answerId) return a;
        const myReactions = a.my_reactions.filter(e => e !== emoji);
        const reactions = { ...a.reactions };
        reactions[emoji] = (reactions[emoji] ?? 1) - 1;
        if (reactions[emoji] <= 0) delete reactions[emoji];
        return { ...a, my_reactions: myReactions, reactions };
      }));
    }
    setLoadingReactions(prev => {
      const next = new Set(prev);
      next.delete(answerId);
      return next;
    });
  };

  const handleSkip = async () => {
    if (!question) return;
    Alert.alert(
      'Skip question?',
      'You can still answer later today.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', onPress: async () => {
          const res = await skipDailyQuestion(question.id);
          if (res.error) {
            Alert.alert('Error', res.error);
          }
        }},
      ],
    );
  };

  const handleShare = (answer: DailyAnswer) => {
    // TODO: Implement share to story/chat
    Alert.alert('Share', 'Sharing coming soon!');
  };

  if (loading) {
    return (
      <Screen padding={0} blobbed>
        <View style={styles.loadingContainer}>
          <AppText variant="body" color={colors.textSecondary}>Loading today&apos;s question&hellip;</AppText>
        </View>
      </Screen>
    );
  }

  if (!question) {
    return (
      <Screen padding={0} blobbed>
        <View style={styles.loadingContainer}>
          <AppText variant="body" color={colors.textSecondary} align="center">
            No question today. Check back tomorrow!
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padding={0} blobbed>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Hero */}
        <LinearGradient
          colors={gradients.violet}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <AppText variant="caption" weight="bold" color={colors.headerText} style={styles.heroLabel}>
            DAILY QUESTION ✦
          </AppText>
          <AppText variant="display" weight="bold" color={colors.headerText}>
            Today&apos;s Question
          </AppText>
          <AppText variant="caption" color={colors.headerText} style={{ opacity: 0.8, marginTop: 4 }}>
            {new Date(question.scheduled_date ?? Date.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
          </AppText>
        </LinearGradient>

        {question && (
          <DailyQuestionCard
            question={question}
            myAnswer={myAnswer}
            answers={answers}
            stats={stats}
            onSubmit={handleSubmit}
            onReact={handleReact}
            onUnreact={handleUnreact}
            onSkip={handleSkip}
            onShare={handleShare}
            submitting={submitting}
            loadingReactions={loadingReactions}
          />
        )}

        {/* Info Card */}
        <Card variant="pop" style={styles.infoCard}>
          <AppText variant="label" weight="bold" color={colors.textSecondary} style={styles.infoTitle}>
            HOW IT WORKS
          </AppText>
          <AppText variant="caption" color={colors.text} style={[styles.infoText, { lineHeight: 20 }]}>
            Every day at midnight, a new question appears. Answer honestly, react to others&apos; answers,
            and build connections. All answers are public by default &mdash; toggle to private if you prefer.
            Questions are curated by the NEXA team (AI-generated coming soon with safety checks).
          </AppText>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  heroLabel: {
    letterSpacing: 1.2,
    opacity: 0.95,
  },
  infoCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  infoTitle: {
    marginBottom: spacing.sm,
  },
  infoText: {
    lineHeight: 20,
  },
});