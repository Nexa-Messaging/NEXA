import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import { radius, shadows, spacing, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import {
  DailyCard as DailyCardType,
  CardCategory,
  CATEGORY_CONFIG,
  completeTodayCard,
  sendCardToFriend,
} from '@/lib/dailyCards';
import { listFriends } from '@/lib/friends';
import { useAuth } from '@/lib/auth';
import { Profile } from '@/types/database';

interface DailyCardProps {
  card: DailyCardType;
  onCompleted?: () => void;
}

export function DailyCard({ card, onCompleted }: DailyCardProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [showSendModal, setShowSendModal] = useState(false);
  const [completing, setCompleting] = useState(false);

  const cfg = CATEGORY_CONFIG[card.category] ?? CATEGORY_CONFIG.question;

  const handleComplete = async () => {
    if (completing || card.completed) return;
    setCompleting(true);
    const { error } = await completeTodayCard(user!.id);
    setCompleting(false);
    if (!error) onCompleted?.();
  };

  return (
    <>
      <View style={[s.card, { backgroundColor: colors.surface }, shadows.card]}>
        <LinearGradient
          colors={cfg.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.header}
        >
          <View style={s.headerRow}>
            <View style={s.categoryPill}>
              <AppText variant="caption" weight="bold" color="#fff">
                {cfg.emoji} {cfg.label.toUpperCase()}
              </AppText>
            </View>
            {card.completed ? (
              <View style={s.donePill}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <AppText variant="caption" weight="bold" color="#fff" style={{ marginLeft: 4 }}>
                  DONE
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="heading" weight="bold" color="#fff" style={s.body}>
            {card.body}
          </AppText>
          {card.points > 0 ? (
            <AppText variant="caption" color="rgba(255,255,255,0.8)" style={s.points}>
              +{card.points} XP
            </AppText>
          ) : null}
        </LinearGradient>

        <View style={s.actions}>
          {card.completed ? (
            <View style={s.completedRow}>
              <Ionicons name="trophy" size={20} color={colors.sun} />
              <AppText variant="label" tone="muted" style={{ marginLeft: 6 }}>
                Card completed — nice work!
              </AppText>
            </View>
          ) : (
            <>
              <AppButton
                title="Complete"
                variant="primary"
                size="sm"
                onPress={handleComplete}
                loading={completing}
                style={{ flex: 1 }}
              />
              <AppButton
                title="Send to friend"
                variant="outline"
                size="sm"
                onPress={() => setShowSendModal(true)}
                style={{ flex: 1 }}
              />
            </>
          )}
        </View>
      </View>

      <SendCardModal
        visible={showSendModal}
        card={card}
        onClose={() => setShowSendModal(false)}
      />
    </>
  );
}

/* ── Send-to-friend modal ─────────────────────────────────────────────────── */

interface SendCardModalProps {
  visible: boolean;
  card: DailyCardType;
  onClose: () => void;
}

function SendCardModal({ visible, card, onClose }: SendCardModalProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  React.useEffect(() => {
    if (visible && friends.length === 0) {
      setLoadingFriends(true);
      listFriends(user!.id).then(({ data }) => {
        setFriends(data ?? []);
        setLoadingFriends(false);
      });
    }
  }, [visible]);

  const handleSend = async () => {
    if (!selectedFriend || sending) return;
    setSending(true);
    const { error } = await sendCardToFriend(user!.id, selectedFriend.id, card.card_id, message || undefined);
    setSending(false);
    if (!error) {
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setSelectedFriend(null);
        setMessage('');
        onClose();
      }, 1200);
    }
  };

  const cfg = CATEGORY_CONFIG[card.category];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={88}
        style={s.modalWrap}
      >
        <Pressable style={s.modalBackdrop} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={s.sheetHandle} />

          <AppText variant="heading" weight="bold">
            Send this card
          </AppText>
          <AppText variant="label" tone="muted" style={{ marginTop: 2 }}>
            {cfg.emoji} {card.body}
          </AppText>

          {sent ? (
            <View style={s.sentSuccess}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
              <AppText variant="body" weight="semibold" style={{ marginTop: 8 }}>
                Sent!
              </AppText>
            </View>
          ) : (
            <>
              {loadingFriends ? (
                <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
              ) : friends.length === 0 ? (
                <AppText variant="body" tone="muted" style={{ marginTop: spacing.md, textAlign: 'center' }}>
                  Add friends first to send cards!
                </AppText>
              ) : (
                <FlatList
                  data={friends}
                  keyExtractor={(f) => f.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.friendList}
                  renderItem={({ item }) => {
                    const isSelected = selectedFriend?.id === item.id;
                    return (
                      <Pressable
                        onPress={() => setSelectedFriend(isSelected ? null : item)}
                        style={[
                          s.friendChip,
                          {
                            backgroundColor: isSelected ? colors.primarySoft : colors.inputBg,
                            borderColor: isSelected ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {item.avatar_url ? (
                          <Image source={{ uri: item.avatar_url }} style={s.friendAvatar} />
                        ) : (
                          <View style={[s.friendAvatar, { backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' }]}>
                            <AppText variant="caption" weight="bold" color="#fff">
                              {(item.display_name ?? 'U')[0]?.toUpperCase()}
                            </AppText>
                          </View>
                        )}
                        <AppText
                          variant="caption"
                          weight={isSelected ? 'bold' : 'regular'}
                          numberOfLines={1}
                          style={{ marginTop: 4, maxWidth: 64 }}
                        >
                          {(item.display_name ?? 'Unknown').split(' ')[0]}
                        </AppText>
                      </Pressable>
                    );
                  }}
                />
              )}

              {selectedFriend ? (
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Add a note (optional)"
                  placeholderTextColor={colors.textMuted}
                  style={[s.noteInput, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBg }]}
                  multiline
                  maxLength={280}
                />
              ) : null}

              <View style={s.sheetActions}>
              <AppButton title="Cancel" variant="ghost" size="sm" onPress={onClose} />
              <AppButton
                title="Send"
                variant="primary"
                size="sm"
                onPress={handleSend}
                loading={sending}
                disabled={!selectedFriend}
              />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  categoryPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  body: {
    lineHeight: typography.heading * 1.35,
  },
  points: {
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  /* modal */
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1C7B7',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  friendList: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  friendChip: {
    alignItems: 'center',
    width: 72,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
    minHeight: 60,
    textAlignVertical: 'top',
    marginTop: spacing.sm,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sentSuccess: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
});
