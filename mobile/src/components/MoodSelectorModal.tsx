import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import { radius, shadows, spacing, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { PRESET_MOODS, defaultMoodExpiration, setMood } from '@/lib/moods';

interface MoodSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onMoodSet: () => void;
}

export function MoodSelectorModal({ visible, onClose, onMoodSet }: MoodSelectorModalProps) {
  const { colors } = useAppTheme();
  const [customEmoji, setCustomEmoji] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [isSetting, setIsSetting] = useState(false);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
      setCustomEmoji('');
      setCustomLabel('');
      setCustomError(null);
      setSelectedPresetIndex(null);
    }
  }, [visible, fadeAnim]);

  const handlePresetPress = (index: number) => {
    setSelectedPresetIndex(index);
    setCustomError(null);
  };

  const handleSetPresetMood = async () => {
    if (selectedPresetIndex === null) {
      return;
    }

    const mood = PRESET_MOODS[selectedPresetIndex];
    setIsSetting(true);

    const result = await setMood(mood.emoji, mood.label, defaultMoodExpiration(), false);
    if (result.error) {
      Alert.alert('Error', result.error);
    } else {
      onMoodSet();
      onClose();
    }
    setIsSetting(false);
  };

  const handleSetCustomMood = async () => {
    if (!customEmoji.trim() || !customLabel.trim()) {
      setCustomError('Please enter both an emoji and a label.');
      return;
    }

    if (customEmoji.trim().length > 2) {
      setCustomError('Emoji must be 1-2 characters.');
      return;
    }

    if (customLabel.trim().length > 20) {
      setCustomError('Label must be 20 characters or less.');
      return;
    }

    setCustomError(null);
    setIsSetting(true);

    const result = await setMood(
      customEmoji.trim(),
      customLabel.trim(),
      defaultMoodExpiration(),
      true,
    );

    if (result.error) {
      Alert.alert('Error', result.error);
    } else {
      onMoodSet();
      onClose();
    }
    setIsSetting(false);
  };

  const handleClearMood = async () => {
    Alert.alert(
      'Clear mood?',
      'Your current mood will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const { clearMood } = await import('@/lib/moods');
            const result = await clearMood();
            if (result.error) {
              Alert.alert('Error', result.error);
            } else {
              onMoodSet();
              onClose();
            }
          },
        },
      ],
    );
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.fadeOverlay, { opacity: fadeAnim }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoiding}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalContainer}>
            <View style={styles.handleWrapper}>
              <View style={styles.handle} />
            </View>

            <Animated.View style={[styles.fadeWrapper, { opacity: fadeAnim }]}>
              <View style={styles.header}>
                <AppText variant="heading" weight="bold">
                  Set your mood
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Expires in 24 hours
                </AppText>
              </View>

              <AppText variant="label" weight="bold" color={colors.textSecondary} style={styles.sectionTitle}>
                Choose a vibe
              </AppText>

              <View style={styles.presetGrid}>
                {PRESET_MOODS.map((mood, index) => (
                  <Pressable
                    key={mood.emoji}
                    style={({ pressed }) => [
                      styles.presetCard,
                      selectedPresetIndex === index && styles.presetCardSelected,
                      pressed && styles.presetCardPressed,
                    ]}
                    onPress={() => handlePresetPress(index)}
                    accessibilityRole="button"
                    accessibilityLabel={mood.label}
                  >
                    <AppText variant="display" style={styles.presetEmoji}>
                      {mood.emoji}
                    </AppText>
                    <AppText variant="caption" weight="semibold" style={styles.presetLabel}>
                      {mood.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              <AppText variant="label" weight="bold" color={colors.textSecondary} style={styles.sectionTitle}>
                Or create your own
              </AppText>

              <View style={styles.customRow}>
                <View style={styles.customField}>
                  <AppText variant="caption" color={colors.textSecondary} style={styles.customFieldLabel}>
                    Emoji
                  </AppText>
                  <TextInput
                    style={[styles.customInput, { backgroundColor: colors.inputBg }]}
                    value={customEmoji}
                    onChangeText={setCustomEmoji}
                    placeholder="😎"
                    maxLength={2}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    textAlign="center"
                    accessibilityLabel="Custom mood emoji"
                  />
                </View>
                <View style={styles.customField}>
                  <AppText variant="caption" color={colors.textSecondary} style={styles.customFieldLabel}>
                    Label
                  </AppText>
                  <TextInput
                    style={[styles.customInput, { backgroundColor: colors.inputBg }]}
                    value={customLabel}
                    onChangeText={setCustomLabel}
                    placeholder="On cloud nine"
                    maxLength={20}
                    autoCapitalize="words"
                    accessibilityLabel="Custom mood label"
                  />
                </View>
              </View>

              {customError ? (
                <AppText variant="caption" tone="danger" style={styles.errorText}>
                  {customError}
                </AppText>
              ) : null}

              <View style={styles.actions}>
                <AppButton
                  title="Set mood"
                  variant="gradient"
                  size="md"
                  fullWidth
                  loading={isSetting}
                  onPress={selectedPresetIndex !== null ? handleSetPresetMood : undefined}
                />
                <AppButton
                  title="Set custom mood"
                  variant="gradient"
                  size="md"
                  fullWidth
                  loading={isSetting}
                  onPress={handleSetCustomMood}
                />
              </View>

              <View style={styles.divider} />

              <AppButton
                title="Clear current mood"
                variant="ghost"
                size="md"
                fullWidth
                onPress={handleClearMood}
              />
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fadeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(33, 23, 15, 0.5)',
    justifyContent: 'flex-end',
  },
  keyboardAvoiding: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: '#FFF9F3',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    maxHeight: '85%',
  },
  handleWrapper: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E7D8C6',
  },
  fadeWrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    justifyContent: 'center',
  },
  presetCard: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#FFF9F3',
    ...shadows.soft,
  },
  presetCardSelected: {
    borderColor: '#6D5CF5',
    backgroundColor: '#ECE9FE',
    ...shadows.card,
  },
  presetCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  presetEmoji: {
    fontSize: 28,
    lineHeight: 36,
  },
  presetLabel: {
    marginTop: 2,
    textAlign: 'center',
  },
  customRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  customField: {
    flex: 1,
  },
  customFieldLabel: {
    marginBottom: spacing.xxs,
  },
  customInput: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
    fontSize: typography.body,
  },
  errorText: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: '#E7D8C6',
    marginVertical: spacing.md,
  },
});