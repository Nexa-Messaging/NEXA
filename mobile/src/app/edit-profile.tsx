import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AvatarPicker, PickedAsset } from '@/components/AvatarPicker';
import { AppButton, AppText, FormField, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { isUsernameTaken, updateOwnAvatar, updateOwnProfile } from '@/lib/profiles';
import {
  publicUrlToObjectPath,
  removeAvatarObject,
  replaceAvatar,
} from '@/lib/storage';
import {
  BIO_MAX_LENGTH,
  normalizeUsername,
  validateBio,
  validateDepartment,
  validateDisplayName,
  validateLevel,
  validateSchool,
  validateUsername,
} from '@/utils/validation';

type EditableField =
  | 'displayName'
  | 'username'
  | 'bio'
  | 'school'
  | 'department'
  | 'level';

interface EditFormErrors {
  displayName?: string;
  username?: string;
  bio?: string;
  school?: string;
  department?: string;
  level?: string;
}

export default function EditProfileScreen() {
  const { profile, user, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [school, setSchool] = useState(profile?.school ?? '');
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [level, setLevel] = useState(profile?.level ?? '');
  const [pickedAsset, setPickedAsset] = useState<PickedAsset | null>(null);

  const [errors, setErrors] = useState<EditFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Populate the form once when the profile is available. Mounting decisions
  // never reset user edits after this.
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (profile && !initialized) {
      setDisplayName(profile.display_name);
      setUsername(profile.username);
      setBio(profile.bio ?? '');
      setSchool(profile.school ?? '');
      setDepartment(profile.department ?? '');
      setLevel(profile.level ?? '');
      setInitialized(true);
    }
  }, [profile, initialized]);

  if (!user || !profile) {
    return (
      <Screen centered>
        <AppText variant="body" color={colors.textSecondary}>
          Loading profile…
        </AppText>
      </Screen>
    );
  }

  const updateField = (field: EditableField, value: string) => {
    if (field === 'displayName') setDisplayName(value);
    else if (field === 'username') setUsername(value);
    else if (field === 'bio') setBio(value);
    else if (field === 'school') setSchool(value);
    else if (field === 'department') setDepartment(value);
    else setLevel(value);

    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  };

  const onSelectAvatar = (asset: PickedAsset) => {
    setPickedAsset(asset);
    setFormError(null);
  };

  const onAvatarError = (message: string) => {
    setFormError(message);
  };

  const onSave = async () => {
    const nextErrors: EditFormErrors = {
      displayName: validateDisplayName(displayName),
      username: validateUsername(username),
      bio: validateBio(bio),
      school: validateSchool(school),
      department: validateDepartment(department),
      level: validateLevel(level),
    };

    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    setFormError(null);

    const trimmedName = displayName.trim();
    const normalizedUsername = normalizeUsername(username);
    const toNull = (value: string) => (value.trim() ? value.trim() : null);

    try {
      const usernameChanged =
        normalizedUsername !== profile.username && normalizedUsername !== '';

      if (usernameChanged && (await isUsernameTaken(normalizedUsername))) {
        setErrors((current) => ({ ...current, username: 'That username is already taken.' }));
        setSaving(false);
        return;
      }

      let avatarUrl: string | null = profile.avatar_url;
      if (pickedAsset) {
        avatarUrl = await uploadAvatar(avatarUrl);
      }

      const updates = {
        display_name: trimmedName,
        username: normalizedUsername,
        bio: toNull(bio),
        school: toNull(school),
        department: toNull(department),
        level: toNull(level),
      };

      const { data, error } = await updateOwnProfile(user.id, updates);
      if (error) {
        setFormError(error);
        setSaving(false);
        return;
      }

      if (avatarUrl !== (data?.avatar_url ?? null)) {
        await updateOwnAvatar(user.id, avatarUrl ?? '');
      }

      await refreshProfile();
      router.back();
    } catch (error) {
      console.warn('Profile save failed:', error);
      setFormError('Could not save your profile. Please try again.');
      setSaving(false);
    }
  };

  const uploadAvatar = async (currentUrl: string | null): Promise<string | null> => {
    if (!pickedAsset || !pickedAsset.uri) {
      return currentUrl;
    }
    const { publicUrl, error } = await replaceAvatar(user.id, pickedAsset);
    if (error) {
      throw new Error(error);
    }
    // Remove the previous object so the bucket doesn't fill up.
    const oldPath = publicUrlToObjectPath(currentUrl);
    if (oldPath) {
      void removeAvatarObject(oldPath);
    }
    return publicUrl;
  };

  return (
    <Screen padding={0}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={12} style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold">
          Edit profile
        </AppText>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <AvatarPicker
          uri={pickedAsset?.uri ?? profile.avatar_url}
          name={profile.display_name}
          onSelect={onSelectAvatar}
          onError={onAvatarError}
          disabled={saving}
        />

        {formError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <AppText variant="label" color={colors.danger} style={styles.errorBannerText}>
              {formError}
            </AppText>
          </View>
        ) : null}

        <FormField
          label="Display name"
          value={displayName}
          onChangeText={(value) => updateField('displayName', value)}
          error={errors.displayName}
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="name"
        />

        <FormField
          label="Username"
          value={username}
          onChangeText={(value) => updateField('username', value)}
          error={errors.username}
          hint="3-20 characters: letters, numbers, underscores."
          autoCapitalize="none"
          autoCorrect={false}
        />

        <FormField
          label={`Bio (${bio.trim().length}/${BIO_MAX_LENGTH})`}
          value={bio}
          onChangeText={(value) => updateField('bio', value)}
          error={errors.bio}
          placeholder="Tell your class about yourself"
          multiline
          numberOfLines={3}
          maxLength={BIO_MAX_LENGTH}
          style={styles.multiline}
        />

        <FormField
          label="School"
          value={school}
          onChangeText={(value) => updateField('school', value)}
          error={errors.school}
          placeholder="e.g. University of Lagos"
          autoCapitalize="words"
        />

        <FormField
          label="Department"
          value={department}
          onChangeText={(value) => updateField('department', value)}
          error={errors.department}
          placeholder="e.g. Computer Science"
          autoCapitalize="words"
        />

        <FormField
          label="Level"
          value={level}
          onChangeText={(value) => updateField('level', value)}
          error={errors.level}
          placeholder="e.g. 300 Level"
          autoCapitalize="words"
        />

        <AppButton
          title="Save changes"
          size="lg"
          fullWidth
          loading={saving}
          onPress={onSave}
          style={{ marginTop: spacing.md }}
        />
        <AppText
          variant="caption"
          color={colors.textMuted}
          align="center"
          style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}
        >
          Your photo and details are only visible to signed-in users.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDECEA',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  errorBannerText: {
    marginLeft: spacing.xs,
    flex: 1,
    lineHeight: 18,
  },
  multiline: {
    height: 84,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
});