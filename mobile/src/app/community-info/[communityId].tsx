import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AvatarPicker, PickedAsset } from '@/components/AvatarPicker';
import { AppButton, AppText, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  addCommunityMembers,
  buildCommunityAvatarPath,
  deleteCommunity,
  fetchClassmates,
  fetchCommunityInfo,
  fetchCommunityMembers,
  leaveCommunity,
  removeCommunityMember,
  resolveCommunityAvatarUrl,
  setCommunityAvatar,
  setCommunityMemberRole,
  updateCommunitySettings,
  uploadCommunityAvatar,
} from '@/lib/communities';
import { ClassmateInfo, CommunityInfo, CommunityMemberInfo, CommunityRole } from '@/types/database';

const ROLE_LABEL: Record<CommunityRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export default function CommunityInfoScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ communityId: string }>();
  const communityId = params.communityId;
  const { user } = useAuth();
  const meId = user?.id ?? '';

  const [community, setCommunity] = useState<CommunityInfo | null>(null);
  const [members, setMembers] = useState<CommunityMemberInfo[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Edit settings modal
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Add members
  const [addingOpen, setAddingOpen] = useState(false);
  const [classmates, setClassmates] = useState<ClassmateInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!communityId) {
      return;
    }
    setLoading(true);
    setError(null);
    const [infoResult, memberResult] = await Promise.all([
      fetchCommunityInfo(communityId),
      fetchCommunityMembers(communityId),
    ]);
    setLoading(false);
    if (infoResult.error) {
      setError(infoResult.error);
      return;
    }
    setCommunity(infoResult.data);
    setMembers(memberResult.error ? [] : (memberResult.data ?? []));
  }, [communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Resolve the community photo whenever it changes.
  useEffect(() => {
    if (!community?.avatar_path) {
      setAvatarUrl(null);
      return;
    }
    let active = true;
    void resolveCommunityAvatarUrl(community.avatar_path).then((result) => {
      if (active && result.url) {
        setAvatarUrl(result.url);
      }
    });
    return () => {
      active = false;
    };
  }, [community?.avatar_path]);

  const myRole = community?.my_role ?? null;
  const canManage = myRole === 'admin' || myRole === 'owner';
  const isOwner = myRole === 'owner';

  const openAddMembers = useCallback(async () => {
    if (!canManage || !communityId) {
      return;
    }
    setAddingOpen(true);
    setAddError(null);
    const existing = new Set(members.map((m) => m.user_id));
    const result = await fetchClassmates(communityId);
    if (result.error) {
      setAddError(result.error);
      setClassmates([]);
      return;
    }
    setClassmates((result.data ?? []).filter((c) => !existing.has(c.user_id)));
    setSelectedIds(new Set());
  }, [canManage, communityId, members]);

  const confirmAddMembers = async () => {
    if (selectedIds.size === 0) {
      setAddingOpen(false);
      return;
    }
    setBusy(true);
    const err = await addCommunityMembers(communityId, [...selectedIds]);
    setBusy(false);
    setAddingOpen(false);
    if (err) {
      setError(err);
    } else {
      await load();
    }
  };

  const onSelectAvatar = async (asset: PickedAsset) => {
    if (!asset.uri || !asset.mimeType) {
      setError('Could not read the selected photo.');
      return;
    }
    setBusy(true);
    setError(null);
    const path = buildCommunityAvatarPath(communityId);
    const uploadError = await uploadCommunityAvatar(path, asset.uri, asset.mimeType);
    if (uploadError) {
      setBusy(false);
      setError(uploadError);
      return;
    }
    const setError_ = await setCommunityAvatar(communityId, path);
    setBusy(false);
    if (setError_) {
      setError(setError_);
    } else {
      await load();
    }
  };

  const onAvatarError = (message: string) => {
    setError(message);
  };

  const openEdit = () => {
    if (community) {
      setNameDraft(community.name);
      setDescriptionDraft(community.description ?? '');
      setEditOpen(true);
    }
  };

  const confirmEdit = async () => {
    const nextName = nameDraft.trim();
    if (!nextName) {
      return;
    }
    setSavingSettings(true);
    const err = await updateCommunitySettings(
      communityId,
      nextName,
      descriptionDraft.trim() || undefined,
    );
    setSavingSettings(false);
    if (err) {
      setError(err);
    } else {
      setEditOpen(false);
      await load();
    }
  };

  const canRemove = (member: CommunityMemberInfo): boolean => {
    if (member.user_id === meId || member.role === 'owner') {
      return false;
    }
    if (isOwner) {
      return true;
    }
    return canManage && member.role === 'member';
  };

  const onRemove = (member: CommunityMemberInfo) => {
    Alert.alert(
      `Remove ${member.display_name}?`,
      'They will no longer see this community or its messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const err = await removeCommunityMember(communityId, member.user_id);
            setBusy(false);
            if (err) {
              setError(err);
            } else {
              await load();
            }
          },
        },
      ],
    );
  };

  const onToggleRole = async (member: CommunityMemberInfo) => {
    if (!isOwner || member.role === 'owner' || member.user_id === meId) {
      return;
    }
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    setBusy(true);
    const err = await setCommunityMemberRole(communityId, member.user_id, nextRole);
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      await load();
    }
  };

  const onLeave = () => {
    Alert.alert('Leave community?', 'You will stop receiving messages from this community.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const err = await leaveCommunity(communityId);
          setBusy(false);
          if (err) {
            setError(err);
          } else {
            router.replace('/(tabs)/communities');
          }
        },
      },
    ]);
  };

  const onDeleteCommunity = () => {
    Alert.alert(
      'Delete community?',
      'This permanently deletes the community, its channels, messages and all attachments for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const err = await deleteCommunity(communityId);
            setBusy(false);
            if (err) {
              setError(err);
            } else {
              router.replace('/(tabs)/communities');
            }
          },
        },
      ],
    );
  };

  const renderMember = ({ item }: { item: CommunityMemberInfo }) => {
    const isMe = item.user_id === meId;
    const removable = canRemove(item);
    const roleToggleable = isOwner && !isMe && item.role !== 'owner';

    return (
      <View style={[styles.memberRow, { borderBottomColor: colors.border }]}>
        <Avatar uri={item.avatar_url} name={item.display_name} size={44} />
        <View style={styles.memberText}>
          <View style={styles.memberNameLine}>
            <AppText variant="body" weight="semibold" numberOfLines={1}>
              {item.display_name}
            </AppText>
            {isMe ? (
              <AppText variant="caption" color={colors.textMuted}>
                {'  '}(you)
              </AppText>
            ) : null}
          </View>
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
            @{item.username}
          </AppText>
        </View>
        <View style={[styles.memberBadge, { backgroundColor: colors.primarySoft }]}>
          <AppText variant="caption" weight="semibold" color={colors.primary}>
            {ROLE_LABEL[item.role as CommunityRole] ?? item.role}
          </AppText>
        </View>
        {roleToggleable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.role === 'admin' ? 'Demote' : 'Promote'} ${item.display_name}`}
            hitSlop={8}
            disabled={busy}
            onPress={() => void onToggleRole(item)}
            style={styles.actionIcon}
          >
            <Ionicons
              name={item.role === 'admin' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
              size={22}
              color={colors.primary}
            />
          </Pressable>
        ) : null}
        {removable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.display_name}`}
            hitSlop={8}
            disabled={busy}
            onPress={() => onRemove(item)}
            style={styles.actionIcon}
          >
            <Ionicons name="person-remove-outline" size={22} color={colors.danger} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <Screen centered>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (!community) {
    return (
      <Screen centered>
        <AppText variant="body" color={colors.textSecondary} align="center" style={styles.stateText}>
          {error ?? 'This community is no longer available.'}
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen padding={0}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={12} style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold">
          Community info
        </AppText>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {canManage ? (
          <AvatarPicker
            uri={avatarUrl}
            name={community.name}
            onSelect={(asset) => void onSelectAvatar(asset)}
            onError={onAvatarError}
            disabled={busy}
          />
        ) : (
          <View style={styles.avatarRow}>
            <Avatar uri={avatarUrl} name={community.name} size={108} />
          </View>
        )}

        <AppText variant="heading" weight="bold" align="center" style={styles.name}>
          {community.name}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} align="center" style={styles.classLine}>
          {community.school} · {community.department} · {community.level}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} align="center">
          {community.member_count} {community.member_count === 1 ? 'member' : 'members'} ·{' '}
          {ROLE_LABEL[(community.my_role ?? 'member') as CommunityRole] ?? community.my_role}
        </AppText>

        {community.description ? (
          <AppText variant="body" color={colors.textSecondary} align="center" style={styles.description}>
            {community.description}
          </AppText>
        ) : null}

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <AppText variant="label" color={colors.danger} style={styles.errorBannerText}>
              {error}
            </AppText>
          </View>
        ) : null}

        <AppText variant="label" weight="semibold" color={colors.textSecondary} style={styles.sectionTitle}>
          MEMBERS
        </AppText>

        {members.length === 0 ? (
          <AppText variant="body" color={colors.textSecondary} style={styles.noMembers}>
            No members yet.
          </AppText>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.user_id}
            renderItem={renderMember}
            scrollEnabled={false}
          />
        )}

        {canManage ? (
          <AppButton
            title="Add classmates"
            variant="secondary"
            size="md"
            fullWidth
            loading={busy}
            onPress={() => void openAddMembers()}
            style={styles.primaryAction}
          />
        ) : null}

        <AppText variant="label" weight="semibold" color={colors.textSecondary} style={styles.sectionTitle}>
          SETTINGS
        </AppText>

        {canManage ? (
          <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingRow icon="create-outline" label="Edit community info" onPress={openEdit} disabled={busy} />
          </View>
        ) : null}

        <AppButton
          title="Leave community"
          variant="danger"
          size="md"
          fullWidth
          loading={busy}
          onPress={onLeave}
          style={styles.primaryAction}
        />

        {isOwner ? (
          <AppButton
            title="Delete community"
            variant="danger"
            size="md"
            fullWidth
            loading={busy}
            onPress={onDeleteCommunity}
            style={styles.dangerAction}
          />
        ) : null}
      </ScrollView>

      {editOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setEditOpen(false)}>
            <Pressable style={[styles.dialog, { backgroundColor: colors.surface }]} onPress={() => {}}>
              <AppText variant="label" weight="semibold" color={colors.textSecondary} style={styles.dialogTitle}>
                EDIT COMMUNITY
              </AppText>
              <TextInput
                style={[styles.dialogInput, { backgroundColor: colors.surfaceMuted, color: colors.text }]}
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Community name"
                placeholderTextColor={colors.textMuted}
                maxLength={80}
              />
              <TextInput
                style={[styles.dialogInput, styles.dialogTextArea, { backgroundColor: colors.surfaceMuted, color: colors.text }]}
                value={descriptionDraft}
                onChangeText={setDescriptionDraft}
                placeholder="Description (optional)"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={500}
              />
              <View style={styles.dialogButtons}>
                <AppButton
                  title="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={() => setEditOpen(false)}
                />
                <AppButton
                  title="Save"
                  size="sm"
                  loading={savingSettings}
                  onPress={() => void confirmEdit()}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {addingOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setAddingOpen(false)}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setAddingOpen(false)}>
            <Pressable style={[styles.dialog, styles.addDialog, { backgroundColor: colors.surface }]} onPress={() => {}}>
              <AppText variant="label" weight="semibold" color={colors.textSecondary} style={styles.dialogTitle}>
                ADD CLASSMATES
              </AppText>

              {addError ? (
                <AppText variant="caption" color={colors.danger} style={styles.addError}>
                  {addError}
                </AppText>
              ) : classmates.length === 0 ? (
                <AppText variant="body" color={colors.textSecondary} align="center" style={styles.noClassmates}>
                  No classmates left to add.
                </AppText>
              ) : (
                <ScrollView style={styles.friendList} keyboardShouldPersistTaps="handled">
                  {classmates.map((classmate) => {
                    const selected = selectedIds.has(classmate.user_id);
                    return (
                      <Pressable
                        key={classmate.user_id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        style={[styles.friendRow, { borderBottomColor: colors.border }]}
                        onPress={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(classmate.user_id)) {
                              next.delete(classmate.user_id);
                            } else {
                              next.add(classmate.user_id);
                            }
                            return next;
                          })
                        }
                      >
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={selected ? colors.primary : colors.textMuted}
                        />
                        <Avatar uri={classmate.avatar_url} name={classmate.display_name} size={36} />
                        <View style={styles.friendText}>
                          <AppText variant="body" weight="semibold" numberOfLines={1}>
                            {classmate.display_name}
                          </AppText>
                          <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                            @{classmate.username}
                          </AppText>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <View style={styles.dialogButtons}>
                <AppButton
                  title="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={() => setAddingOpen(false)}
                />
                <AppButton
                  title={selectedIds.size > 0 ? `Add (${selectedIds.size})` : 'Add'}
                  size="sm"
                  onPress={() => void confirmAddMembers()}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Screen>
  );
}

function SettingRow({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.settingRow}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <AppText variant="body" weight="semibold" style={styles.settingLabel}>
        {label}
      </AppText>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  avatarRow: {
    alignItems: 'center',
  },
  name: {
    marginTop: spacing.md,
  },
  classLine: {
    marginTop: 2,
  },
  description: {
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  errorBannerText: {
    marginLeft: spacing.xs,
    flex: 1,
    lineHeight: 18,
  },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  noMembers: {
    paddingVertical: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  memberText: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.xs,
  },
  memberNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  actionIcon: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  primaryAction: {
    marginTop: spacing.lg,
  },
  dangerAction: {
    marginTop: spacing.sm,
  },
  settingsCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  settingLabel: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  dialog: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  addDialog: {
    maxHeight: '80%',
  },
  dialogTitle: {
    marginBottom: spacing.md,
  },
  dialogInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  dialogTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  addError: {
    marginBottom: spacing.sm,
  },
  noClassmates: {
    paddingVertical: spacing.md,
  },
  friendList: {
    maxHeight: 360,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  friendText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  stateText: {
    lineHeight: 22,
  },
});