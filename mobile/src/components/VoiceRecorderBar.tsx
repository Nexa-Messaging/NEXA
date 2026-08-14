import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
import { formatDuration } from '@/utils/format';

export interface VoiceRecorderBarProps {
  onSend: (recording: { uri: string; durationSeconds: number }) => void;
  onCancel: () => void;
}

type Stage = 'preparing' | 'recording' | 'denied' | 'review';

/**
 * Records a voice note. Mounts already recording: permission is requested,
 * the recorder starts immediately and the user stops/cancels/sends from the
 * bar. A review step lets them preview the clip before sending.
 */
export function VoiceRecorderBar({ onSend, onCancel }: VoiceRecorderBarProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [stage, setStage] = useState<Stage>('preparing');
  const [error, setError] = useState<string | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const bootstrappedRef = useRef(false);

  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;
    void (async () => {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setError('Microphone access is required to record a voice note.');
          setStage('denied');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setStage('recording');
      } catch {
        setError('Could not start the recorder.');
        setStage('denied');
      }
    })();
  }, [recorder]);

  useEffect(() => {
    if (recordedUri) {
      player.replace(recordedUri);
    }
  }, [recordedUri, player]);

  useEffect(() => {
    return () => {
      if (recorder.isRecording) {
        void recorder.stop();
      }
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    };
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<boolean> => {
    if (!recorder.isRecording) {
      return true;
    }
    try {
      await recorder.stop();
      return true;
    } catch {
      setError('Could not finish the recording.');
      return false;
    }
  }, [recorder]);

  const handleStop = useCallback(async () => {
    if (await stopRecording()) {
      const uri = recorder.uri;
      if (uri) {
        setRecordedUri(uri);
        setRecordedSeconds(Math.max(1, Math.round(recorderState.durationMillis / 1000)));
        setStage('review');
      } else {
        setError('No recording was captured.');
        setStage('denied');
      }
    }
  }, [stopRecording, recorder, recorderState.durationMillis]);

  const handleCancel = useCallback(() => {
    void stopRecording().finally(onCancel);
  }, [stopRecording, onCancel]);

  const handleSend = useCallback(() => {
    if (!recordedUri) {
      return;
    }
    void stopRecording().then(() => {
      onSend({ uri: recordedUri, durationSeconds: recordedSeconds });
    });
  }, [stopRecording, recordedUri, recordedSeconds, onSend]);

  const togglePreview = useCallback(() => {
    if (playerStatus.playing) {
      player.pause();
    } else {
      if (playerStatus.duration > 0 && playerStatus.currentTime >= playerStatus.duration - 0.25) {
        player.seekTo(0);
      }
      player.play();
    }
  }, [player, playerStatus.playing, playerStatus.duration, playerStatus.currentTime]);

  return (
    <View style={styles.container}>
      {stage === 'preparing' ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.primary} />
          <AppText variant="body" color={colors.textSecondary} style={styles.label}>
            Preparing recorder…
          </AppText>
        </View>
      ) : null}

      {stage === 'denied' ? (
        <View style={styles.row}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <AppText variant="body" color={colors.danger} style={styles.label}>
            {error ?? 'Voice notes are unavailable.'}
          </AppText>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={handleCancel}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {stage === 'recording' ? (
        <View style={styles.row}>
          <View style={styles.recDot} />
          <AppText
            variant="body"
            weight="semibold"
            color={colors.danger}
            style={styles.timer}
          >
            {formatDuration(recorderState.durationMillis / 1000)}
          </AppText>
          <View style={styles.spacer} />
          <Pressable accessibilityRole="button" hitSlop={10} onPress={handleCancel}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
            onPress={() => void handleStop()}
            style={styles.stopButton}
          >
            <View style={styles.stopSquare} />
          </Pressable>
        </View>
      ) : null}

      {stage === 'review' ? (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playerStatus.playing ? 'Pause preview' : 'Play preview'}
            onPress={togglePreview}
            style={styles.previewButton}
          >
            <Ionicons
              name={playerStatus.playing ? 'pause' : 'play'}
              size={18}
              color={colors.primary}
              style={playerStatus.playing ? undefined : styles.playOffset}
            />
          </Pressable>
          <AppText variant="body" color={colors.text} style={styles.timer}>
            {formatDuration(recordedSeconds)}
          </AppText>
          <View style={styles.spacer} />
          <Pressable accessibilityRole="button" hitSlop={10} onPress={handleCancel}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send voice note"
            onPress={handleSend}
            style={styles.sendButton}
          >
            <Ionicons name="arrow-up" size={20} color={colors.surface} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  label: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  recDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    marginRight: spacing.sm,
  },
  timer: {
    fontVariant: ['tabular-nums'],
  },
  spacer: {
    flex: 1,
  },
  stopButton: {
    width: 44,
    height: 44,
    marginLeft: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: colors.surface,
  },
  previewButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  playOffset: {
    marginLeft: 2,
  },
  sendButton: {
    width: 44,
    height: 44,
    marginLeft: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
