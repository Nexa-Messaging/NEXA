import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AttachmentPickerSheet } from '@/components/AttachmentPickerSheet';
import { MediaPreview, MediaPreviewModal } from '@/components/MediaPreviewModal';
import { MessageActionsSheet } from '@/components/MessageActionsSheet';
import { ChatItem, MessageBubble } from '@/components/MessageBubble';
import { MessageInput } from '@/components/MessageInput';
import { RealtimeBanner } from '@/components/RealtimeBanner';
import { ReportSheet } from '@/components/ReportSheet';
import { VoiceRecorderBar } from '@/components/VoiceRecorderBar';
import { AppText, Screen } from '@/components/ui';
import { gradients, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { PendingMessage, useMessages } from '@/hooks/useMessages';
import { useAuth } from '@/lib/auth';
import {
  deleteMessage,
  editMessage,
  fetchConversationInfo,
  reactToMessage,
  resolveMediaUrl,
  unreactToMessage,
} from '@/lib/messaging';
import { fetchProfileById } from '@/lib/profiles';
import {
  isConversationMuted,
  reportMessage,
  setConversationMuted,
 ReportCategory } from '@/lib/moderation';
import { MessageRow } from '@/types/database';
import { pickCompressedVideo } from '@/utils/mediaCompression';
import { timeAgoShort } from '@/utils/format';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useIsOnline } from '@/hooks/usePresence';

interface ReplyState {
  messageId: string;
  text: string;
  senderName: string;
}

interface EditState {
  messageId: string;
  text: string;
}

function canEditMessage(createdAt: string): boolean {
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff < 10 * 60 * 1000; // 10 minutes
}

/** "Last seen 3m ago" → "Last seen Aug 4"; avoids "Last seen Just now". */
function lastSeenLabel(iso: string): string {
  const rel = timeAgoShort(iso);
  if (rel === 'Just now') {
    return 'Active just now';
  }
  return rel.includes(' ') ? `Last seen ${rel}` : `Last seen ${rel} ago`;
}

export default function ChatScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const { user } = useAuth();
  const meId = user?.id ?? '';

  const chat = useMessages(conversationId);
  const { typingName, onTyping, onSendOrClear } = useTypingIndicator(conversationId);
  const [peer, setPeer] = useState<{
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
  } | null>(null);
  const [peerLastSeen, setPeerLastSeen] = useState<string | null>(null);
  const peerOnline = useIsOnline(peer?.id);
  const [peerLoading, setPeerLoading] = useState(true);
  const [input, setInput] = useState('');
  const [replying, setReplying] = useState<ReplyState | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [sheetItem, setSheetItem] = useState<MessageRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [preview, setPreview] = useState<MediaPreview | null>(null);
  const [previewCaption, setPreviewCaption] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const mediaUrlSeen = useRef<Set<string>>(new Set());

  const [muted, setMuted] = useState(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const [reportItem, setReportItem] = useState<MessageRow | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const listRef = useRef<FlatList<ChatItem>>(null);
  const stickToBottom = useRef(true);

  // Load the conversation's mute state once per conversation. Re-fetching on
  // every `muted` change would race the mute toggle and loop on failure.
  useEffect(() => {
    if (!conversationId) {
      return;
    }
    let active = true;
    void isConversationMuted('dm', conversationId).then(({ muted: mutedState, error }) => {
      if (active && !error) {
        setMuted(mutedState);
      }
    });
    return () => {
      active = false;
    };
  }, [conversationId]);

  const toggleMute = () => {
    if (!conversationId || muteBusy) {
      return;
    }
    setMuteBusy(true);
    void setConversationMuted('dm', conversationId, !muted).then((error) => {
      setMuteBusy(false);
      if (error) {
        setActionError(error);
      } else {
        setMuted((prev) => !prev);
      }
    });
  };

  const submitReport = (category: ReportCategory, details?: string) => {
    if (!reportItem) {
      return;
    }
    setReportError(null);
    setReportSubmitting(true);
    void reportMessage(reportItem.id, category, details).then((error) => {
      setReportSubmitting(false);
      if (error) {
        setReportError(error);
      } else {
        setReportItem(null);
        setActionError(null);
        Alert.alert('Report sent', 'Thanks — our team will review it.');
      }
    });
  };

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    let active = true;
    setPeerLoading(true);
    void fetchConversationInfo(conversationId).then(({ data }) => {
      if (!active) {
        return;
      }
      setPeerLoading(false);
      if (data) {
        setPeer({
          id: data.other_user_id,
          displayName: data.display_name,
          username: data.username,
          avatarUrl: data.avatar_url,
        });
        void fetchProfileById(data.other_user_id).then(({ data: profile }) => {
          if (active) {
            setPeerLastSeen(profile?.last_seen_at ?? null);
          }
        });
      } else {
        setPeer(null);
        setPeerLastSeen(null);
      }
    });
    return () => {
      active = false;
    };
  }, [conversationId]);

  // Resolve short-lived signed URLs for every media message shown here.
  useEffect(() => {
    for (const message of chat.messages) {
      if (!message.media_path || mediaUrlSeen.current.has(message.id)) {
        continue;
      }
      void resolveMediaUrl(message.id, message.media_path).then((result) => {
        if (result.url) {
          mediaUrlSeen.current.add(message.id);
          setMediaUrls((prev) => ({ ...prev, [message.id]: result.url as string }));
        }
      });
    }
  }, [chat.messages]);

  useFocusEffect(
    useCallback(() => {
      chat.setFocused(true);
      return () => chat.setFocused(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId]),
  );

  const items = useMemo<ChatItem[]>(() => {
    const pendingItems = [...chat.pending].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : 1,
    );
    return [...chat.messages, ...pendingItems];
  }, [chat.messages, chat.pending]);

  const replyTextFor = useCallback(
    (item: ChatItem): string | null => {
      if ('status' in item) {
        return item.replyText ?? null;
      }
      if (!item.reply_to_id) {
        return null;
      }
      const found = chat.messages.find((m) => m.id === item.reply_to_id);
      if (found) {
        return found.deleted_at ? 'This message was deleted' : (found.body ?? '');
      }
      return 'Message';
    },
    [chat.messages],
  );

  const isMine = (item: ChatItem): boolean => {
    if ('status' in item) {
      return true;
    }
    return item.sender_id === meId;
  };

  const toggleReaction = async (message: MessageRow, emoji: string, hasMine: boolean) => {
    setActionError(null);
    const error = hasMine
      ? await unreactToMessage(message.id, emoji)
      : await reactToMessage(message.id, emoji);
    if (error) {
      setActionError(error);
    }
  };

  const onDelete = async (message: MessageRow) => {
    Alert.alert('Delete message?', 'This removes the message for everyone in this chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setSheetItem(null);
          setActionError(null);
          void deleteMessage(message.id).then((error) => {
            if (error) {
              setActionError(error);
            }
          });
        },
      },
    ]);
  };

  const onSend = () => {
    const text = input.trim();
    if (!text) {
      return;
    }
    onSendOrClear();
    if (editing) {
      void editMessage(editing.messageId, text).then((error) => {
        if (error) setActionError(error);
      });
      setEditing(null);
      setInput('');
      return;
    }
    chat.send(text, replying?.messageId ?? null, replying?.text ?? undefined);
    setInput('');
    setReplying(null);
  };

  const onOpenPicker = () => {
    Keyboard.dismiss();
    setPickerVisible(true);
  };

  const handleReply = (messageId: string) => {
    const msg = chat.messages.find((m) => m.id === messageId);
    if (!msg) return;
    const text = msg.deleted_at ? 'This message was deleted' : (msg.body ?? '');
    setReplying({
      messageId: msg.id,
      text,
      senderName: msg.sender_id === meId ? 'you' : (peer?.displayName ?? 'them'),
    });
    setEditing(null);
  };

  const handleScrollToReply = (replyToId: string) => {
    const idx = items.findIndex((m) => !('status' in m) && m.id === replyToId);
    if (idx >= 0) {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    }
  };

  const handlePickImage = async () => {
    setPickerVisible(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const asset = result.assets[0];
    setPreview({
      kind: 'image',
      uri: asset.uri,
      width: asset.width || undefined,
      height: asset.height || undefined,
    });
    setPreviewCaption('');
  };

  const handlePickVideo = async () => {
    setPickerVisible(false);
    const picked = await pickCompressedVideo();
    if (picked.canceled) {
      return;
    }
    if ('error' in picked) {
      setActionError(picked.error);
      return;
    }
    const asset = picked.video;
    setPreview({
      kind: 'video',
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.durationSeconds,
    });
    setPreviewCaption('');
  };

  const handleVoiceNote = () => {
    setPickerVisible(false);
    Keyboard.dismiss();
    setReplying(null);
    setVoiceActive(true);
  };

  const onSendPreview = () => {
    if (!preview) {
      return;
    }
    chat.sendMedia(
      {
        kind: preview.kind,
        mimeType: preview.kind === 'image' ? 'image/jpeg' : 'video/mp4',
        uri: preview.uri,
        width: preview.width,
        height: preview.height,
        durationSeconds: preview.durationSeconds,
      },
      previewCaption,
      replying?.messageId ?? null,
      replying?.text,
    );
    setPreview(null);
    setPreviewCaption('');
    setReplying(null);
  };

  const onVoiceSend = ({
    uri,
    durationSeconds,
  }: {
    uri: string;
    durationSeconds: number;
  }) => {
    chat.sendMedia(
      { kind: 'voice', mimeType: 'audio/mp4', uri, durationSeconds },
      '',
      replying?.messageId ?? null,
      replying?.text,
    );
    setVoiceActive(false);
    setReplying(null);
  };

  const onScroll = (event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    stickToBottom.current =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
  };

  const renderItem = ({ item }: { item: ChatItem }) => {
    const mine = isMine(item);
    const pendingFailed = 'status' in item && item.status === 'failed';
    const realMessage = !('status' in item) && !item.deleted_at;

    return (
      <MessageBubble
        item={item}
        isMine={mine}
        replyText={replyTextFor(item)}
        meId={meId}
        mediaUrl={mediaUrls[item.id] ?? null}
        onLongPress={() => {
          if (pendingFailed) {
            chat.discard(item.id);
          } else if (realMessage && 'id' in item) {
            setSheetItem(item as MessageRow);
          }
        }}
        onRetry={
          pendingFailed && 'status' in item
            ? () => chat.retry(item as PendingMessage)
            : undefined
        }
        onReact={(emoji, hasMine) => {
          if (realMessage && 'id' in item) {
            void toggleReaction(item as MessageRow, emoji, hasMine);
          }
        }}
        onReply={handleReply}
        onScrollToReply={handleScrollToReply}
      />
    );
  };

  return (
    <Screen padding={0}>
      <LinearGradient
        colors={gradients.ocean}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerBand}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.headerText} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.peer}
            disabled={!peer}
            onPress={() => peer && router.push(`/users/${peer.username}`)}
          >
            <Avatar uri={peer?.avatarUrl} name={peer?.displayName} size={36} />
            <View style={styles.peerText}>
              <AppText variant="body" weight="bold" color={colors.headerText} numberOfLines={1}>
                {peer ? peer.displayName : 'Loading…'}
              </AppText>
              {peer ? (
                <View style={styles.peerStatusRow}>
                  {peerOnline ? (
                    <View style={styles.onlineDot} />
                  ) : null}
                  <AppText variant="caption" color={colors.headerText} numberOfLines={1} style={styles.peerSub}>
                    {peerOnline ? 'online' : peerLastSeen ? lastSeenLabel(peerLastSeen) : `@${peer.username}`}
                  </AppText>
                </View>
              ) : null}
            </View>
          </Pressable>
          <View style={styles.backButton}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Unmute conversation' : 'Mute conversation'}
              hitSlop={12}
              onPress={toggleMute}
            >
              <Ionicons
                name={muted ? 'notifications-off-outline' : 'notifications-outline'}
                size={22}
                color={muted ? colors.sun : colors.surface}
              />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <RealtimeBanner status={chat.realtime} />

      {!peerLoading && !peer ? (
        <View style={styles.state}>
          <AppText variant="body" color={colors.textSecondary} align="center" style={styles.stateText}>
            This conversation is no longer available.
          </AppText>
        </View>
      ) : chat.loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : chat.error ? (
        <View style={styles.state}>
          <AppText variant="body" color={colors.textSecondary} align="center" style={styles.stateText}>
            {chat.error}
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => void chat.refresh()} style={styles.retry}>
            <AppText variant="label" color={colors.primary} weight="semibold">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 88}
        >
          {items.length === 0 ? (
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.textMuted} />
              <AppText variant="body" color={colors.textSecondary} align="center" style={styles.emptyText}>
                No messages yet. Say hi to {peer?.displayName ?? 'them'}!
              </AppText>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              onScroll={onScroll}
              scrollEventThrottle={64}
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              onStartReached={() => {
                if (chat.hasMore) {
                  void chat.loadOlder();
                }
              }}
              onStartReachedThreshold={0.3}
              onScrollToIndexFailed={({ index }) => {
                listRef.current?.scrollToOffset({ offset: index * 120, animated: true });
              }}
              getItemLayout={(_, index) => ({
                length: 100,
                offset: 100 * index,
                index,
              })}
              ListHeaderComponent={
                chat.hasMore || chat.loadingOlder ? (
                  <View style={styles.olderLoader}>
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                    <AppText variant="caption" color={colors.textSecondary}>
                      Loading earlier messages…
                    </AppText>
                  </View>
                ) : null
              }
              onContentSizeChange={() => {
                if (stickToBottom.current) {
                  listRef.current?.scrollToEnd({ animated: true });
                }
              }}
            />
          )}

          {chat.sendError ? (
            <View style={[styles.sendErrorBar, { backgroundColor: colors.dangerSoft }]}>
              <AppText variant="caption" color={colors.danger} style={styles.flex}>
                {chat.sendError}
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" hitSlop={10} onPress={chat.clearSendError}>
                <Ionicons name="close" size={16} color={colors.danger} />
              </Pressable>
            </View>
          ) : null}

          {actionError ? (
            <View style={[styles.sendErrorBar, { backgroundColor: colors.dangerSoft }]}>
              <AppText variant="caption" color={colors.danger} style={styles.flex}>
                {actionError}
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" hitSlop={10} onPress={() => setActionError(null)}>
                <Ionicons name="close" size={16} color={colors.danger} />
              </Pressable>
            </View>
          ) : null}

          {typingName ? (
            <View style={styles.typingBar}>
              <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                {typingName} is typing...
              </AppText>
            </View>
          ) : null}

          {voiceActive ? (
            <VoiceRecorderBar onSend={onVoiceSend} onCancel={() => setVoiceActive(false)} />
          ) : (
            <MessageInput
              value={input}
              onChangeText={(text) => { setInput(text); onTyping(); }}
              onSend={onSend}
              replyingTo={
                replying
                  ? { name: replying.senderName, text: replying.text }
                  : null
              }
              onCancelReply={() => setReplying(null)}
              editing={editing ? { text: editing.text } : null}
              onCancelEdit={() => { setEditing(null); setInput(''); }}
              onAttach={onOpenPicker}
            />
          )}
        </KeyboardAvoidingView>
      )}

      <AttachmentPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPickImage={() => void handlePickImage()}
        onPickVideo={() => void handlePickVideo()}
        onVoiceNote={handleVoiceNote}
      />

      <MediaPreviewModal
        visible={preview !== null}
        media={preview}
        caption={previewCaption}
        onChangeCaption={setPreviewCaption}
        onSend={onSendPreview}
        onClose={() => {
          setPreview(null);
          setPreviewCaption('');
        }}
      />

      <MessageActionsSheet
        visible={sheetItem !== null}
        isMine={sheetItem ? sheetItem.sender_id === meId : false}
        canDelete={sheetItem ? sheetItem.sender_id === meId : false}
        canEdit={
          sheetItem
            ? sheetItem.sender_id === meId &&
              !sheetItem.deleted_at &&
              canEditMessage(sheetItem.created_at)
            : false
        }
        messageText={
          sheetItem?.deleted_at
            ? 'This message was deleted'
            : (sheetItem?.body ?? '')
        }
        onClose={() => setSheetItem(null)}
        onReply={() => {
          if (!sheetItem) {
            return;
          }
          const text = sheetItem.deleted_at ? 'This message was deleted' : (sheetItem.body ?? '');
          setReplying({
            messageId: sheetItem.id,
            text,
            senderName: sheetItem.sender_id === meId ? 'you' : (peer?.displayName ?? 'them'),
          });
          setEditing(null);
          setSheetItem(null);
        }}
        onEdit={() => {
          if (!sheetItem) return;
          setEditing({ messageId: sheetItem.id, text: sheetItem.body ?? '' });
          setInput(sheetItem.body ?? '');
          setReplying(null);
          setSheetItem(null);
        }}
        onDelete={() => {
          if (sheetItem) {
            void onDelete(sheetItem);
          }
        }}
        onReact={(emoji) => {
          if (!sheetItem) {
            return;
          }
          setSheetItem(null);
          const hasMine = Array.isArray(sheetItem.reactions)
            ? (sheetItem.reactions as { user_id: string }[]).some(
                (r) => r.user_id === meId && 'emoji' in r && (r as { emoji: string }).emoji === emoji,
              )
            : false;
          void toggleReaction(sheetItem, emoji, hasMine);
        }}
        onReport={() => {
          if (sheetItem) {
            setReportError(null);
            setReportItem(sheetItem);
          }
        }}
      />

      <ReportSheet
        visible={reportItem !== null}
        title="Report message"
        submitting={reportSubmitting}
        error={reportError}
        onClose={() => {
          setReportItem(null);
          setReportError(null);
        }}
        onSubmit={(category, details) => submitReport(category, details)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerBand: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    marginHorizontal: spacing.md,
    ...({
      shadowColor: '#1D1A2F',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    } as object),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  peerText: {
    marginLeft: spacing.sm,
    maxWidth: '70%',
  },
  peerSub: {
    opacity: 0.85,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.lg,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  stateText: {
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  retry: {
    padding: spacing.xs,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  olderLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  sendErrorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  typingBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
  },
  peerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#17B978',
    marginRight: 4,
  },
});