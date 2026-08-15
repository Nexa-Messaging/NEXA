import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
import { buildStoryPath, postStory, uploadStoryMedia } from '@/lib/stories';
import { useAppTheme } from '@/lib/theme';

type Step = 'pick' | 'media' | 'text';

interface DraftMedia {
  kind: 'image' | 'video';
  uri: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface StoryComposerModalProps {
  visible: boolean;
  meId: string;
  onClose: () => void;
  /** Called after a story is successfully posted. */
  onPosted: () => void;
}

/**
 * Modal for creating a story: choose photo (camera), photo (gallery), video
 * (camera) or a text story, preview + caption, then post. Media is uploaded to
 * the private `stories-media` bucket before the row is registered.
 */
export function StoryComposerModal({ visible, meId, onClose, onPosted }: StoryComposerModalProps) {
  const { colors } = useAppTheme();
  const [step, setStep] = useState<Step>('pick');
  const [draft, setDraft] = useState<DraftMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoPlayer = useVideoPlayer(draft && draft.kind === 'video' ? draft.uri : null);

  useEffect(() => {
    if (!visible) {
      setStep('pick');
      setDraft(null);
      setCaption('');
      setPosting(false);
      setProgress(0);
      setError(null);
    }
  }, [visible]);

  const close = useCallback(() => {
    if (!posting) {
      onClose();
    }
  }, [posting, onClose]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission is required to take a photo.');
      return;
    }
    setError(null);
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) {
      const asset = result.assets[0];
      setDraft({
        kind: 'image',
        uri: asset.uri,
        width: asset.width > 0 ? asset.width : undefined,
        height: asset.height > 0 ? asset.height : undefined,
      });
      setStep('media');
    }
  }, []);

  const pickPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo library permission is required.');
      return;
    }
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) {
      const asset = result.assets[0];
      setDraft({
        kind: 'image',
        uri: asset.uri,
        width: asset.width > 0 ? asset.width : undefined,
        height: asset.height > 0 ? asset.height : undefined,
      });
      setStep('media');
    }
  }, []);

  const takeVideo = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission is required to record a video.');
      return;
    }
    setError(null);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      quality: 0.8,
      videoMaxDuration: 60,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setDraft({
        kind: 'video',
        uri: asset.uri,
        width: asset.width > 0 ? asset.width : undefined,
        height: asset.height > 0 ? asset.height : undefined,
        durationSeconds: asset.duration ? asset.duration / 1000 : undefined,
      });
      setStep('media');
    }
  }, []);

  const canPost =
    (draft !== null || (step === 'text' && caption.trim().length > 0)) && !posting;

  const post = useCallback(async () => {
    if (!meId || posting) {
      return;
    }
    setPosting(true);
    setProgress(0);
    setError(null);

    if (draft) {
      const mimeType = draft.kind === 'image' ? 'image/jpeg' : 'video/mp4';
      const ext = draft.kind === 'image' ? 'jpg' : 'mp4';
      const path = buildStoryPath(meId, `story.${ext}`);
      const uploaded = await uploadStoryMedia(
        path,
        {
          kind: draft.kind,
          mimeType,
          uri: draft.uri,
          width: draft.width,
          height: draft.height,
          durationSeconds: draft.durationSeconds,
        },
        setProgress,
      );
      if (uploaded) {
        setPosting(false);
        setError(uploaded);
        return;
      }
      const result = await postStory({
        kind: draft.kind === 'image' ? 'photo' : 'video',
        media: {
          kind: draft.kind,
          mimeType,
          uri: draft.uri,
          path,
          width: draft.width,
          height: draft.height,
          durationSeconds: draft.durationSeconds,
        },
        body: caption.trim(),
      });
      if (!result.ok) {
        setPosting(false);
        setError(result.error);
        return;
      }
    } else {
      const result = await postStory({ kind: 'text', body: caption.trim() });
      if (!result.ok) {
        setPosting(false);
        setError(result.error);
        return;
      }
    }

    setPosting(false);
    onPosted();
    onClose();
  }, [meId, posting, draft, caption, onPosted, onClose]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={close}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={26} color={colors.surface} />
          </Pressable>
          <AppText variant="label" weight="semibold" color={colors.surface} style={styles.headerTitle}>
            NEW STORY
          </AppText>
          <View style={styles.iconButton} />
        </View>

        {step === 'pick' ? (
          <View style={styles.pickArea}>
            <View style={styles.pickRow}>
              <PickAction icon="camera-outline" label="Photo" onPress={() => void takePhoto()} />
              <PickAction icon="images-outline" label="Gallery" onPress={() => void pickPhoto()} />
            </View>
            <View style={styles.pickRow}>
              <PickAction icon="videocam-outline" label="Video" onPress={() => void takeVideo()} />
              <PickAction
                icon="text-outline"
                label="Text"
                onPress={() => {
                  setError(null);
                  setStep('text');
                }}
              />
            </View>
            {error ? (
              <AppText variant="caption" color={colors.danger} align="center" style={styles.error}>
                {error}
              </AppText>
            ) : null}
          </View>
        ) : step === 'text' ? (
          <View style={styles.editorArea}>
            <TextInput
              style={styles.textInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Share a thought…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={4000}
              autoFocus
              accessibilityLabel="Story text"
            />
            <View style={styles.composer}>
              <AppText variant="caption" color={colors.textMuted}>
                {caption.length}/4000
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Post story"
                accessibilityState={{ disabled: !canPost }}
                disabled={!canPost}
                onPress={() => void post()}
                style={[styles.sendButton, !canPost && styles.sendButtonDisabled]}
              >
                <Ionicons name="arrow-up" size={20} color={colors.surface} />
              </Pressable>
            </View>
            {error ? (
              <AppText variant="caption" color={colors.danger} align="center" style={styles.error}>
                {error}
              </AppText>
            ) : null}
          </View>
        ) : (
          <View style={styles.editorArea}>
            <View style={styles.mediaArea}>
              {draft?.kind === 'video' ? (
                <VideoView player={videoPlayer} style={styles.preview} nativeControls contentFit="contain" />
              ) : (
                <Image
                  source={draft ? { uri: draft.uri } : undefined}
                  style={styles.preview}
                  contentFit="contain"
                />
              )}
            </View>
            {posting ? (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator color={colors.surface} />
                <AppText variant="label" weight="semibold" color={colors.surface} style={styles.uploadingText}>
                  {Math.round(progress * 100)}%
                </AppText>
              </View>
            ) : null}
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={caption}
                onChangeText={setCaption}
                placeholder="Add a caption…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={4000}
                editable={!posting}
                accessibilityLabel="Story caption"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Post story"
                accessibilityState={{ disabled: !canPost }}
                disabled={!canPost}
                onPress={() => void post()}
                style={[styles.sendButton, !canPost && styles.sendButtonDisabled]}
              >
                {posting ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Ionicons name="arrow-up" size={20} color={colors.surface} />
                )}
              </Pressable>
            </View>
            {error ? (
              <AppText variant="caption" color={colors.danger} align="center" style={styles.error}>
                {error}
              </AppText>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" style={styles.pick} onPress={onPress}>
      <Ionicons name={icon} size={28} color={colors.primary} />
      <AppText variant="label" weight="semibold" color={colors.text} style={styles.pickLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F18',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    letterSpacing: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  pickRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  pick: {
    width: 130,
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickLabel: {
    marginTop: spacing.sm,
  },
  editorArea: {
    flex: 1,
  },
  mediaArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  preview: {
    width: '100%',
    maxWidth: 460,
    height: '85%',
    borderRadius: radius.md,
  },
  textInput: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    color: colors.surface,
    fontSize: 26,
    lineHeight: 36,
    textAlignVertical: 'top',
  },
  uploader: {
    flex: 1,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    color: colors.text,
    maxHeight: 120,
    minHeight: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    marginLeft: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  uploadingText: {
    marginTop: spacing.sm,
  },
  error: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },
});