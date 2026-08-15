import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppText, AppButton, FormField, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  buildEventImagePath,
  createCommunityEvent,
  fetchCommunityEvents,
  resolveEventImageUrl,
  updateCommunityEvent,
  uploadEventImage,
} from '@/lib/events';
import { formatDateTime } from '@/utils/format';

const START_CHOICES: { label: string; fromNowMs: number }[] = [
  { label: 'Tonight · 7 PM', fromNowMs: 3 * 60 * 60 * 1000 },
  { label: 'Tomorrow · 10 AM', fromNowMs: 24 * 60 * 60 * 1000 },
  { label: 'This Saturday · 10 AM', fromNowMs: 6 * 24 * 60 * 60 * 1000 },
  { label: 'Next week', fromNowMs: 7 * 24 * 60 * 60 * 1000 },
];

export default function EventFormScreen() {
  const params = useLocalSearchParams<{ communityId: string; eventId?: string }>();
  const communityId = params.communityId;
  const editingEventId = params.eventId;

  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null);
  const [pickerImage, setPickerImage] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [startsError, setStartsError] = useState<string | null>(null);

  // Load the event being edited so the form can be pre-filled.
  useEffect(() => {
    if (!editingEventId) {
      setLoading(false);
      return;
    }
    let active = true;
    async function load() {
      const result = await fetchCommunityEvents(communityId);
      if (!active) {
        return;
      }
      const event = (result.data ?? []).find((item) => item.event_id === editingEventId);
      if (!event) {
        setError('This event is no longer available.');
      } else {
        setTitle(event.title);
        setDescription(event.description ?? '');
        setLocation(event.location ?? '');
        setStartsAt(event.starts_at);
        setExistingImagePath(event.image_path);
      }
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [editingEventId, communityId]);

  // Resolve the existing event photo (edit mode).
  useEffect(() => {
    if (!existingImagePath) {
      setExistingImageUrl(null);
      return;
    }
    let active = true;
    void resolveEventImageUrl(existingImagePath).then((result) => {
      if (active && result.url) {
        setExistingImageUrl(result.url);
      }
    });
    return () => {
      active = false;
    };
  }, [existingImagePath]);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is required to add an event photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const asset = result.assets[0];
    const fileName =
      asset.fileName ??
      `event-${Date.now()}.${asset.mimeType?.split('/')[1] ?? 'jpg'}`;
    setPickerImage({
      uri: asset.uri,
      name: fileName,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
    setExistingImagePath(null);
    setError(null);
  };

  const validate = (): boolean => {
    const nextTitleError = title.trim() ? null : 'Give the event a title.';
    const nextStartsError = startsAt ? null : 'Choose a start time.';
    setTitleError(nextTitleError);
    setStartsError(nextStartsError);
    return !nextTitleError && !nextStartsError;
  };

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }
    Keyboard.dismiss();
    if (!validate() || !startsAt) {
      return;
    }
    setSubmitting(true);
    setError(null);

    let imagePath = existingImagePath ?? undefined;
    if (pickerImage) {
      if (!user?.id) {
        setSubmitting(false);
        setError('You need to be signed in to add a photo.');
        return;
      }
      setUploading(true);
      const path = buildEventImagePath(communityId, user.id, pickerImage.name);
      const uploadError = await uploadEventImage(path, pickerImage);
      if (uploadError) {
        setUploading(false);
        setSubmitting(false);
        setError(uploadError);
        return;
      }
      imagePath = path;
      setUploading(false);
    }

    const patch = {
      title: title.trim(),
      description: description.trim() || undefined,
      startsAt,
      location: location.trim() || undefined,
      imagePath,
    };

    const result = editingEventId
      ? await updateCommunityEvent(editingEventId, patch)
      : await (async () => {
          const created = await createCommunityEvent(communityId, patch);
          return created.ok ? null : created.error;
        })();

    setSubmitting(false);
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    router.back();
  };

  if (loading) {
    return (
      <Screen centered>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={12} style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold" style={styles.headerTitle}>
          {editingEventId ? 'Edit event' : 'New event'}
        </AppText>
      </View>

      <FormField
        label="Title"
        placeholder="Book club, meetup, football session…"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
        error={titleError}
      />

      <FormField
        label="Description"
        placeholder="What should people know?"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        maxLength={1000}
        style={styles.descriptionField}
        textAlignVertical="top"
      />

      {startsAt ? (
        <AppText variant="body" weight="semibold" color={colors.primary} style={styles.startsAt}>
          {formatDateTime(startsAt)}
        </AppText>
      ) : null}
      <AppText variant="label" weight="medium" color={colors.textSecondary} style={styles.sectionLabel}>
        Start time
      </AppText>
      <View style={styles.chipRow}>
        {START_CHOICES.map((choice) => {
          const target = new Date(Date.now() + choice.fromNowMs);
          const active = startsAt === target.toISOString();
          return (
            <Pressable
              key={choice.label}
              accessibilityRole="button"
              onPress={() => setStartsAt(target.toISOString())}
              style={[styles.chip, startsError && !startsAt && styles.chipError, active && styles.chipActive]}
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
      {startsError ? (
        <AppText variant="caption" color={colors.danger} style={styles.startsError}>
          {startsError}
        </AppText>
      ) : null}

      <FormField
        label="Location (optional)"
        placeholder="Room, address or link"
        value={location}
        onChangeText={setLocation}
        maxLength={120}
      />

      <AppText variant="label" weight="medium" color={colors.textSecondary} style={styles.sectionLabel}>
        Photo (optional)
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => void handlePickImage()}
        style={styles.imagePicker}
      >
        {pickerImage?.uri ? (
          <Image source={{ uri: pickerImage.uri }} style={styles.previewImage} />
        ) : existingImageUrl ? (
          <Image source={{ uri: existingImageUrl }} style={styles.previewImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={28} color={colors.textMuted} />
            <AppText variant="caption" color={colors.textSecondary}>
              Add a photo
            </AppText>
          </View>
        )}
        {pickerImage?.uri || existingImageUrl ? (
          <View style={styles.imageActions}>
            <AppText variant="caption" color={colors.textSecondary}>
              Change
            </AppText>
          </View>
        ) : null}
      </Pressable>

      {error ? (
        <AppText variant="label" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <AppButton
        title={editingEventId ? 'Save changes' : 'Create event'}
        fullWidth
        loading={submitting || uploading}
        disabled={submitting || uploading || !communityId}
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
  descriptionField: {
    height: 120,
  },
  startsAt: {
    marginTop: spacing.xs,
  },
  sectionLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
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
  chipError: {
    borderColor: colors.danger,
  },
  startsError: {
    marginTop: spacing.xxs,
  },
  imagePicker: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    marginTop: spacing.xs,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.lg,
  },
  imagePlaceholder: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  imageActions: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  error: {
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  submit: {
    marginTop: spacing.lg,
  },
});