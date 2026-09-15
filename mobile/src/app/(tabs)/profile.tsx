import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Modal,
  Pressable,
  Image,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { MoodSelectorModal } from '@/components/MoodSelectorModal';
import { ThemePicker } from '@/components/ThemePicker';
import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { gradients, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { fetchMood } from '@/lib/moods';
import { formatDateJoined } from '@/utils/format';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const { profile, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [moodModalVisible, setMoodModalVisible] = useState(false);
  const [currentMood, setCurrentMood] = useState<import('@/lib/moods').Mood | null>(null);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);

  const loadMood = React.useCallback(async () => {
    if (profile?.id) {
      const result = await fetchMood(profile.id);
      if (result.data) {
        setCurrentMood(result.data);
      }
    }
  }, [profile]);

  React.useEffect(() => {
    loadMood();
  }, [loadMood]);

  const onSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    const result = await signOut();
    if (result.error) {
      setSignOutError(result.error);
    }
    setSigningOut(false);
  };

  const handleMoodSet = () => {
    loadMood();
  };

  const username = profile?.username ?? user?.email;

  return (
    <Screen padding={0} blobbed>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <LinearGradient
          colors={gradients.violet}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <AppText variant="caption" weight="bold" color={colors.headerText} style={styles.heroLabel}>
            YOUR SPACE ✦
          </AppText>
          <AppText variant="display" weight="bold" color={colors.headerText}>
            Profile
          </AppText>
        </LinearGradient>

        <Card variant="pop" style={styles.card}>
          <View style={styles.identity}>
            <View style={styles.identityInner}>
              <Avatar
                uri={profile?.avatar_url}
                name={profile?.display_name}
                size={84}
                ring
                mood={currentMood}
                moodSize="lg"
                onPress={() => setImageViewerVisible(true)}
              />
              <View style={styles.identityText}>
                <AppText variant="heading" weight="bold">
                  {profile?.display_name ?? 'Loading…'}
                </AppText>
                <AppText variant="body" tone="secondary">
                  @{username}
                </AppText>
                <View style={[styles.joinedSticker, { backgroundColor: colors.mintSoft }]}>
                  <AppText variant="caption" weight="bold" color={colors.mint}>
                    {formatDateJoined(profile?.created_at)}
                  </AppText>
                </View>
              </View>
            </View>
          </View>
        </Card>

        <AppButton
          title="Set mood"
          variant="gradient"
          size="md"
          fullWidth
          style={{ marginTop: spacing.md }}
          onPress={() => setMoodModalVisible(true)}
        />
        <AppButton
          title="Edit profile"
          variant="gradient"
          size="md"
          fullWidth
          style={{ marginTop: spacing.sm }}
          onPress={() => router.push('/edit-profile')}
        />
        <AppButton
          title="View public profile"
          variant="outline"
          size="md"
          fullWidth
          style={{ marginTop: spacing.sm }}
          onPress={() => {
            if (profile?.username) {
              router.push(`/users/${profile.username}`);
            }
          }}
        />

        <AppButton
          title="Appearance"
          variant="outline"
          size="md"
          fullWidth
          style={{ marginTop: spacing.sm }}
          onPress={() => router.push('/settings/appearance' as any)}
        />

        <ThemePicker />

        {signOutError ? (
          <AppText variant="caption" tone="danger" align="center" style={{ marginTop: spacing.md }}>
            {signOutError}
          </AppText>
        ) : null}

        <AppButton
          title="Log out"
          variant="ghost"
          size="md"
          fullWidth
          loading={signingOut}
          onPress={onSignOut}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>

      <MoodSelectorModal
        visible={moodModalVisible}
        onClose={() => setMoodModalVisible(false)}
        onMoodSet={handleMoodSet}
      />

      {/* Profile Image Full-Screen Viewer */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={imageViewerVisible}
        onRequestClose={() => setImageViewerVisible(false)}
      >
        <Pressable
          style={styles.viewerBackground}
          onPress={() => setImageViewerVisible(false)}
        >
          <View style={styles.viewerContainer}>
            <Image
              source={{ uri: profile?.avatar_url ?? '' }}
              style={styles.viewerImage}
              accessibilityLabel={profile?.display_name ?? 'Profile picture'}
            />
            <Pressable style={styles.closeButton} onPress={() => setImageViewerVisible(false)}>
              <Ionicons name="close-outline" size={28} color={colors.textMuted} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  heroLabel: {
    letterSpacing: 1.2,
    opacity: 0.95,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.lg,
    padding: spacing.lg,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  identityText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  identityInner: {
    width: 84,
  },
  joinedSticker: {
    alignSelf: 'flex-start',
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  viewerBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerContainer: {
    maxWidth: '90%',
    maxHeight: '90%',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    borderRadius: radius.lg,
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.pill,
    padding: 8,
  },
});
