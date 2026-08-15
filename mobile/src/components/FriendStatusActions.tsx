import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppButton, AppButtonProps } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/theme';
import { FriendshipStatus } from '@/lib/friends';
import { useAppTheme } from '@/lib/theme';

export interface FriendStatusActionsProps {
  status: FriendshipStatus | 'loading';
  busy?: boolean;
  error?: string | null;
  /** Hide all actions for the current user's own profile. */
  isSelf?: boolean;
  onSend?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  onRemove?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
  /** Opens a 1:1 chat with this user (only shown once friends). */
  onMessage?: () => void;
}

const EMPTY_CALLBACKS = {
  onSend: undefined,
  onAccept: undefined,
  onReject: undefined,
  onCancel: undefined,
  onRemove: undefined,
  onBlock: undefined,
  onUnblock: undefined,
  onMessage: undefined,
};

/**
 * Renders the correct action controls for a relationship status. Used on the
 * public profile; row lists render their own compact controls.
 */
export function FriendStatusActions(props: FriendStatusActionsProps) {
  const { colors } = useAppTheme();
  const {
    status,
    busy = false,
    error,
    isSelf = false,
    onSend = EMPTY_CALLBACKS.onSend,
    onAccept = EMPTY_CALLBACKS.onAccept,
    onReject = EMPTY_CALLBACKS.onReject,
    onCancel = EMPTY_CALLBACKS.onCancel,
    onRemove = EMPTY_CALLBACKS.onRemove,
    onBlock = EMPTY_CALLBACKS.onBlock,
    onUnblock = EMPTY_CALLBACKS.onUnblock,
    onMessage = EMPTY_CALLBACKS.onMessage,
  } = props;

  if (isSelf || status === 'loading') {
    return null;
  }

  return (
    <View style={styles.container}>
      {status === 'none' ? (
        <AppButton title="Add friend" size="lg" fullWidth loading={busy} onPress={onSend} />
      ) : null}

      {status === 'request_sent' ? (
        <>
          <AppButton
            title="Request Sent"
            size="lg"
            fullWidth
            variant="secondary"
            disabled
          />
          <AppButton title="Cancel request" variant="ghost" size="md" fullWidth onPress={onCancel} />
        </>
      ) : null}

      {status === 'request_received' ? (
        <>
          <View style={styles.row}>
            <AppButton
              title="Accept"
              size="md"
              fullWidth
              loading={busy}
              onPress={onAccept}
              style={styles.flex}
            />
            <AppButton
              title="Reject"
              size="md"
              fullWidth
              variant="outline"
              style={[styles.flex, styles.rowGap]}
              onPress={onReject}
            />
          </View>
        </>
      ) : null}

      {status === 'friends' ? (
        <>
          <AppButton title="Message" size="lg" fullWidth loading={busy} onPress={onMessage} />
          <AppButton title="Remove friend" variant="ghost" size="md" fullWidth onPress={onRemove} />
        </>
      ) : null}

      {status === 'i_blocked' ? (
        <AppButton title="Unblock user" size="lg" fullWidth onPress={onUnblock} />
      ) : null}

      {status === 'none' || status === 'request_received' || status === 'friends' ? (
        <AppButton
          title="Block user"
          variant="ghost"
          size="sm"
          fullWidth
          onPress={onBlock}
          style={styles.block}
        />
      ) : null}

      {error ? (
        <AppText variant="caption" color="#E2594B" align="center" style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/** Compact single-button row action for list rows. */
export function CompactStatusAction({
  status,
  busy = false,
  onSend,
  onAccept,
  onCancel,
  onBlock,
}: Pick<
  FriendStatusActionsProps,
  'status' | 'busy' | 'onSend' | 'onAccept' | 'onCancel' | 'onBlock'
>) {
  if (status === 'loading') {
    return <ActivityIndicator />;
  }

  let title = '';
  let variant: AppButtonProps['variant'] = 'outline';
  let disabled = false;
  let onPress: (() => void) | undefined;

  switch (status) {
    case 'none':
      title = 'Add friend';
      variant = 'primary';
      onPress = onSend;
      break;
    case 'request_sent':
      if (onCancel) {
        title = 'Cancel';
        variant = 'outline';
        onPress = onCancel;
      } else {
        title = 'Sent';
        disabled = true;
      }
      break;
    case 'request_received':
      title = 'Accept';
      variant = 'primary';
      onPress = onAccept;
      break;
    case 'friends':
      title = 'Friends';
      variant = 'secondary';
      disabled = true;
      break;
    case 'i_blocked':
      title = 'Blocked';
      variant = 'secondary';
      disabled = true;
      break;
    case 'they_blocked_me':
      title = 'Unavailable';
      disabled = true;
      break;
  }

  return (
    <AppButton
      title={title}
      size="sm"
      variant={variant}
      disabled={disabled}
      loading={busy}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
  },
  rowGap: {
    marginLeft: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  block: {
    marginTop: spacing.sm,
  },
  error: {
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});