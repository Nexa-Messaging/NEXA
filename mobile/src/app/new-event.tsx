import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppButton, AppText, Screen } from '@/components/ui';
import { radius, spacing, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { createUserEvent, UserLocationType } from '@/lib/events';

const LOCATION_OPTIONS: { key: UserLocationType; label: string; emoji: string }[] = [
  { key: 'physical', label: 'In Person', emoji: '📍' },
  { key: 'online', label: 'Online', emoji: '🌐' },
  { key: 'hybrid', label: 'Hybrid', emoji: '🔗' },
];

export default function CreateEventScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(new Date(Date.now() + 86400000)); // tomorrow
  const [location, setLocation] = useState('');
  const [locationType, setLocationType] = useState<UserLocationType>('physical');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('Event title is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error: err } = await createUserEvent({
      title: title.trim(),
      description: description.trim() || undefined,
      starts_at: startsAt.toISOString(),
      location: location.trim() || undefined,
      location_type: locationType,
    });
    setSubmitting(false);
    if (err) {
      setError(err);
    } else if (data) {
      router.replace(`/event/${data}`);
    }
  };

  return (
    <Screen padding={0} blobbed>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <AppText variant="title" weight="bold">
            Create Event
          </AppText>
          <AppText variant="body" tone="muted">
            Share an event with the community
          </AppText>
        </View>

        {/* Title */}
        <View style={s.field}>
          <AppText variant="label" weight="bold">Title *</AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What's happening?"
            placeholderTextColor={colors.textMuted}
            style={[s.input, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBg }]}
            maxLength={120}
          />
        </View>

        {/* Description */}
        <View style={s.field}>
          <AppText variant="label" weight="bold">Description</AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add details about the event..."
            placeholderTextColor={colors.textMuted}
            style={[s.input, s.textArea, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBg }]}
            multiline
            maxLength={1000}
          />
        </View>

        {/* Date/Time */}
        <View style={s.field}>
          <AppText variant="label" weight="bold">{"Date & Time *"}</AppText>
          <View style={s.dateTimeRow}>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[s.dateBtn, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <AppText variant="body">{startsAt.toLocaleDateString()}</AppText>
            </Pressable>
            <Pressable
              onPress={() => setShowTimePicker(true)}
              style={[s.dateBtn, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
            >
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <AppText variant="body">
                {startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </AppText>
            </Pressable>
          </View>
          {showDatePicker && (
            <DateTimePicker
              value={startsAt}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, date) => {
                setShowDatePicker(false);
                if (date) setStartsAt(date);
              }}
              minimumDate={new Date()}
            />
          )}
          {showTimePicker && (
            <DateTimePicker
              value={startsAt}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, date) => {
                setShowTimePicker(false);
                if (date) setStartsAt(date);
              }}
            />
          )}
        </View>

        {/* Location type */}
        <View style={s.field}>
          <AppText variant="label" weight="bold">Location Type</AppText>
          <View style={s.chipRow}>
            {LOCATION_OPTIONS.map((opt) => {
              const active = locationType === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setLocationType(opt.key)}
                  style={[
                    s.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.inputBg,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight={active ? 'bold' : 'regular'}
                    color={active ? '#fff' : colors.textSecondary}
                  >
                    {opt.emoji} {opt.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Location text */}
        {locationType !== 'online' && (
          <View style={s.field}>
            <AppText variant="label" weight="bold">Location</AppText>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Where is it? (city, venue)"
              placeholderTextColor={colors.textMuted}
              style={[s.input, { borderColor: colors.inputBorder, color: colors.text, backgroundColor: colors.inputBg }]}
              maxLength={200}
            />
            <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xxs }}>
              Only the city/region will be shown publicly — no precise address
            </AppText>
          </View>
        )}

        {error ? (
          <AppText variant="caption" tone="danger" align="center">
            {error}
          </AppText>
        ) : null}

        <View style={s.actions}>
          <AppButton
            title="Cancel"
            variant="ghost"
            size="md"
            onPress={() => router.back()}
          />
          <AppButton
            title="Create Event"
            variant="gradient"
            size="md"
            onPress={handleCreate}
            loading={submitting}
            disabled={!title.trim()}
            style={{ flex: 2 }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xxs,
  },
  field: {
    gap: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
