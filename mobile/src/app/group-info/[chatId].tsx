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
import { useAuth } from '@/lib/auth';
import { listFriends } from '@/lib/friends';
import {
  addGroupMembers,
  buildGroupAvatarPath,
  deleteGroup,
  fetchGroupChatInfo,
  fetchGroupMembers,
  leaveGroup,
  removeGroupMember,
  renameGroup,
  resolveGroupAvatarUrl,
  setGroupAvatar,
  setGroupMemberRole,
  uploadGroupAvatar,
} from '@/lib/groups';
import { GroupChatInfo, GroupMemberInfo, GroupRole } from '@/types/database';

const ROLE_LABEL: Record<GroupRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export default function GroupInfoScreen() {
  const params = useLocalSearchParams<{ chatId: string }>();
  const chatId = params.chatId;
  const { user } = useAuth();
  const meId = user?.id ?? '';

  const [group, setGroup] = useState<GroupChatInfo | null>(null);
  const [members, setMembers] = useState<GroupMemberInfo[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Rename modal
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Add members
  const [addingOpen, setAddingOpen] = useState(false);
  const [friends, setFriends] = useState<GroupMemberInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [friendsError, setFriendsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!chatId) {
      return;
    }
    setLoading(true);
    setError(null);
    const [infoResult, memberResult] = await Promise.all([
      fetchGroupChatInfo(chatId),
      fetchGroupMembers(chatId),
    ]);
    setLoading(false);
    if (infoResult.error) {
      setError(infoResult.error);
      return;
    }
    setGroup(infoResult.data);
    setMembers(memberResult.error ? [] : (memberResult.data ?? []));
  }, [chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Resolve the group photo whenever it changes.
  useEffect(() => {
    if (!group?.avatar_path) {
      setAvatarUrl(null);
      return;
    }
    let active = true;
    void resolveGroupAvatarUrl(group.avatar_path).then((result) => {
      if (active && result.url) {
        setAvatarUrl(result.url);
      }
    });
    return () => {
      active = false;
    };
  }, [group?.avatar_path]);

  const myRole = group?.my_role ?? null;
  const canManage = myRole === 'admin' || myRole === 'owner';
  const isOwner = myRole === 'owner';

  const openAddMembers = useCallback(async () => {
    if (!canManage || !user) {
      return;
    }
    setAddingOpen(true);
    setFriendsError(null);
    const existing = new Set(members.map((m) => m.user_id));
    const result = await listFriends(user.id);
    if (result.error) {
      setFriendsError(result.error);
      setFriends([]);
      return;
    }
    const candidates = (result.data ?? [])
      .filter((friend) => !existing.has(friend.id))
      .map(
        (friend): GroupMemberInfo => ({
          user_id: friend.id,
          display_name: friend.display_name,
          username: friend.username,
          avatar_url: friend.avatar_url,
          role: 'member',
          joined_at: '',
        }),
      );
    setFriends(candidates);
    setSelectedIds(new Set());
  }, [canManage, members, user]);

  const confirmAddMembers = async () => {
    if (selectedIds.size === 0) {
      setAddingOpen(false);
      return;
    }
    setBusy(true);
    const err = await addGroupMembers(chatId, [...selectedIds]);
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
    const path = buildGroupAvatarPath(chatId);
    const uploadError = await uploadGroupAvatar(path, asset.uri, asset.mimeType);
    if (uploadError) {
      setBusy(false);
      setError(uploadError);
      return;
    }
    const setError_ = await setGroupAvatar(chatId, path);
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

  const openRename = () => {
    if (group) {
      setNameDraft(group.name);
      setRenameOpen(true);
    }
  };

  const confirmRename = async () => {
    const next = nameDraft.trim();
    if (!next || next === group?.name) {
      setRenameOpen(false);
      return;
    }
    setSavingName(true);
    const err = await renameGroup(chatId, next);
    setSavingName(false);
    if (err) {
      setError(err);
    } else {
      setRenameOpen(false);
      await load();
    }
  };

  const canRemove = (member: GroupMemberInfo): boolean => {
    if (member.user_id === meId || member.role === 'owner') {
      return false;
    }
    if (isOwner) {
      return true;
    }
    return canManage && member.role === 'member';
  };

  const onRemove = (member: GroupMemberInfo) => {
    Alert.alert(
      `Remove ${member.display_name}?`,
      'They will no longer see this group or its messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const err = await removeGroupMember(chatId, member.user_id);
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

  const onToggleRole = async (member: GroupMemberInfo) => {
    if (!isOwner || member.role === 'owner' || member.user_id === meId) {
      return;
    }
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    setBusy(true);
    const err = await setGroupMemberRole(chatId, member.user_id, nextRole);
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      await load();
    }
  };

  const onLeave = () => {
    Alert.alert('Leave group?', 'You will stop receiving messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const err = await leaveGroup(chatId);
          setBusy(false);
          if (err) {
            setError(err);
          } else {
            router.replace('/chats');
          }
        },
      },
    ]);
  };

  const onDeleteGroup = () => {
    Alert.alert(
      'Delete group?',
      'This permanently deletes the group, its messages and all attachments for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const err = await deleteGroup(chatId);
            setBusy(false);
            if (err) {
              setError(err);
            } else {
              router.replace('/chats');
            }
          },
        },
      ],
    );
  };

  const renderMember = ({ item }: { item: GroupMemberInfo }) => {
    const isMe = item.user_id === meId;
    const removeable = canRemove(item);
    const roleToggleable = isOwner && !isMe && item.role !== 'owner';

    return (
      <View style={styles.memberRow}>
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
        <View style={styles.memberBadge}>
          <AppText variant="caption" weight="semibold" color={colors.primary}>
            {ROLE_LABEL[item.role as GroupRole] ?? item.role}
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
        {removeable ? (
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

  if (!group) {
    return (
      <Screen centered>
        <AppText variant="body" color={colors.textSecondary} align="center" style={{ lineHeight: 22 }}>
          {error ?? 'This group is no longer available.'}
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen padding={0}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={12} style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold">
          Group info
        </AppText>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {canManage ? (
          <AvatarPicker
            uri={avatarUrl}
            name={group.name}
            onSelect={(asset) => void onSelectAvatar(asset)}
            onError={onAvatarError}
            disabled={busy}
          />
        ) : (
          <View style={styles.avatarRow}>
            <Avatar uri={avatarUrl} name={group.name} size={108} />
          </View>
        )}

        <AppText variant="heading" weight="bold" align="center" style={styles.name}>
          {group.name}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} align="center">
          {members.length} {members.length === 1 ? 'member' : 'members'} · {ROLE_LABEL[myRole as GroupRole] ?? myRole}
        </AppText>

        {error ? (
          <View style={styles.errorBanner}>
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
            title="Add members"
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
          <View style={styles.settingsCard}>
            <SettingRow icon="create-outline" label="Rename group" onPress={openRename} disabled={busy} />
          </View>
        ) : null}

        <AppButton
          title="Leave group"
          variant="danger"
          size="md"
          fullWidth
          loading={busy}
          onPress={onLeave}
          style={styles.primaryAction}
        />

        {isOwner ? (
          <AppButton
            title="Delete group"
            variant="danger"
            size="md"
            fullWidth
            loading={busy}
            onPress={onDeleteGroup}
            style={styles.dangerAction}
          />
        ) : null}
      </ScrollView>

      {renameOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
          <Pressable accessibilityRole="button" style={styles.backdrop} onPress={() => setRenameOpen(false)}>
            <Pressable style={styles.dialog} onPress={() => {}}>
              <AppText variant="label" weight="semibold" color={colors.textSecondary} style={styles.dialogTitle}>
                RENAME GROUP
              </AppText>
              <TextInput
                style={styles.dialogInput}
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Group name"
                placeholderTextColor={colors.textMuted}
                autoFocus
                maxLength={80}
              />
              <View style={styles.dialogButtons}>
                <AppButton
                  title="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={() => setRenameOpen(false)}
                />
                <AppButton
                  title="Save"
                  size="sm"
                  loading={savingName}
                  onPress={() => void confirmRename()}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {addingOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setAddingOpen(false)}>
          <Pressable accessibilityRole="button" style={styles.backdrop} onPress={() => setAddingOpen(false)}>
            <Pressable style={[styles.dialog, styles.addDialog]} onPress={() => {}}>
              <AppText variant="label" weight="semibold" color={colors.textSecondary} style={styles.dialogTitle}>
                ADD MEMBERS
              </AppText>

              {friendsError ? (
                <AppText variant="caption" color={colors.danger} style={styles.friendsError}>
                  {friendsError}
                </AppText>
              ) : friends.length === 0 ? (
                <AppText variant="body" color={colors.textSecondary} align="center" style={styles.noFriends}>
                  No friends left to add.
                </AppText>
              ) : (
                <ScrollView style={styles.friendList} keyboardShouldPersistTaps="handled">
                  {friends.map((friend) => {
                    const selected = selectedIds.has(friend.user_id);
                    return (
                      <Pressable
                        key={friend.user_id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        style={styles.friendRow}
                        onPress={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(friend.user_id)) {
                              next.delete(friend.user_id);
                            } else {
                              next.add(friend.user_id);
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
                        <Avatar uri={friend.avatar_url} name={friend.display_name} size={36} />
                        <View style={styles.friendText}>
                          <AppText variant="body" weight="semibold" numberOfLines={1}>
                            {friend.display_name}
                          </AppText>
                          <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                            @{friend.username}
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
    borderBottomColor: colors.border,
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
    backgroundColor: colors.primarySoft,
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
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  dialog: {
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  friendsError: {
    marginBottom: spacing.sm,
  },
  noFriends: {
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
    borderBottomColor: colors.border,
  },
  friendText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
});