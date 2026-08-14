import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
import { formatDuration } from '@/utils/format';

export interface VoiceNotePlayerProps {
  /** Local file uri (pending message) or a resolved signed URL. */
  uri: string | null;
  /** Fallback duration in seconds when the player has not loaded yet. */
  durationSeconds?: number;
  isMine?: boolean;
}

/**
 * Compact voice-note player: play/pause, a progress bar and the elapsed time.
 * Used both for message bubbles and inside the recorder's review step.
 */
export function VoiceNotePlayer({ uri, durationSeconds, isMine = false }: VoiceNotePlayerProps) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (uri) {
      player.replace(uri);
    }
  }, [uri, player]);

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
    } else {
      if (status.duration > 0 && status.currentTime >= status.duration - 0.25) {
        player.seekTo(0);
      }
      player.play();
    }
  }, [player, status.playing, status.duration, status.currentTime]);

  const duration = status.duration > 0 ? status.duration : (durationSeconds ?? 0);
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const elapsed = status.playing || status.currentTime > 0 ? status.currentTime : 0;

  const accent = isMine ? colors.surface : colors.primary;

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
        onPress={toggle}
        style={[styles.playButton, isMine ? styles.playMine : styles.playTheirs]}
      >
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={18}
          color={accent}
          style={status.playing ? undefined : styles.playIconOffset}
        />
      </Pressable>

      <View style={styles.trackWrap}>
        <View style={[styles.track, isMine ? styles.trackMine : styles.trackTheirs]}>
          <View
            style={[
              styles.trackFill,
              { width: `${progress * 100}%` },
              isMine ? styles.fillMine : styles.fillTheirs,
            ]}
          />
        </View>
        <View style={styles.timeRow}>
          <AppText variant="caption" color={isMine ? colors.primaryMuted : colors.textMuted}>
            {formatDuration(elapsed)}
          </AppText>
          <AppText variant="caption" color={isMine ? colors.primaryMuted : colors.textMuted}>
            {formatDuration(duration)}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
    maxWidth: 240,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playMine: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  playTheirs: {
    backgroundColor: colors.primarySoft,
  },
  playIconOffset: {
    marginLeft: 2,
  },
  trackWrap: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  track: {
    height: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  trackMine: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  trackTheirs: {
    backgroundColor: colors.surfaceMuted,
  },
  trackFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  fillMine: {
    backgroundColor: colors.surface,
  },
  fillTheirs: {
    backgroundColor: colors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xxs,
  },
});
