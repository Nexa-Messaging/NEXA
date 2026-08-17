import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { GradientText } from '@/components/ui/GradientText';
import { gradients, radius, shadows, spacing, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

const MIN_DISPLAY_MS = 1800;
const EXIT_MS = 350;
const LOGO_SIZE = 116;

interface SplashScreenProps {
  /** True once auth/session init has finished underneath. */
  ready: boolean;
  /** Called after the fade-out reveal completes. */
  onDone: () => void;
}

/**
 * Animated NEXA splash shown while the app initializes.
 *
 * Entrance: the logo tile fades in with a springy scale-up, the "NEXA"
 * wordmark and tagline fade in behind it, and a soft halo pulses around the
 * tile. Three graffiti contour blobs drift slowly in the background so the
 * screen feels alive. Once the app is `ready` (and the minimum display time
 * has passed) the whole overlay fades and scales out to reveal the app.
 *
 * The logo is rendered from design tokens (same as the welcome screen) so it
 * never stretches or distorts across screen sizes.
 */
export function SplashScreen({ ready, onDone }: SplashScreenProps) {
  const { colors } = useAppTheme();
  const mountedAt = useRef(Date.now());
  const finished = useRef(false);

  const logoFade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const wordmarkFade = useRef(new Animated.Value(0)).current;
  const taglineFade = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const drift1 = useRef(new Animated.Value(0)).current;
  const drift2 = useRef(new Animated.Value(0)).current;
  const drift3 = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayScale = useRef(new Animated.Value(1)).current;

  // Entrance + ambient loops.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoFade, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }),
    ]).start();
    Animated.timing(wordmarkFade, {
      toValue: 1,
      duration: 500,
      delay: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.timing(taglineFade, {
      toValue: 1,
      duration: 450,
      delay: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    const driftLoop = (value: Animated.Value, duration: number, range: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: range,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: -range,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
    const loops = [driftLoop(drift1, 6000, 18), driftLoop(drift2, 7600, 26), driftLoop(drift3, 9200, 14)];
    loops.forEach((loop) => loop.start());

    return () => {
      pulse.stop();
      loops.forEach((loop) => loop.stop());
    };
  }, [logoFade, logoScale, wordmarkFade, taglineFade, glow, drift1, drift2, drift3]);

  // Reveal the app once init is done and the minimum display time has passed.
  useEffect(() => {
    if (!ready || finished.current) return;
    const elapsed = Date.now() - mountedAt.current;
    const delay = Math.max(0, MIN_DISPLAY_MS - elapsed);
    const timer = setTimeout(() => {
      finished.current = true;
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: EXIT_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(overlayScale, {
          toValue: 1.05,
          duration: EXIT_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(({ finished: done }) => {
        if (done) onDone();
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [ready, onDone, overlayOpacity, overlayScale]);

  const haloOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.05] });
  const haloScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const haloSpin = glow.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        styles.overlay,
        { backgroundColor: colors.background },
        { opacity: overlayOpacity, transform: [{ scale: overlayScale }] },
      ]}
    >
      {/* Drifting graffiti contour blobs. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.blob,
          styles.blobA,
          { backgroundColor: colors.primarySoft, transform: [{ translateY: drift1 }, { rotate: '-12deg' }] },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.blob,
          styles.blobB,
          { backgroundColor: colors.pinkSoft, transform: [{ translateY: drift2 }, { rotate: '8deg' }] },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.blob,
          styles.blobC,
          { backgroundColor: colors.skySoft, transform: [{ translateY: drift3 }, { rotate: '-4deg' }] },
        ]}
      />

      <View style={styles.center}>
        <View style={styles.logoWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                backgroundColor: colors.primary,
                opacity: haloOpacity,
                transform: [{ scale: haloScale }, { rotate: haloSpin }],
              },
            ]}
          />
          <Animated.View style={{ opacity: logoFade, transform: [{ scale: logoScale }] }}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logo}
            >
              <AppText variant="display" color={colors.headerText} weight="bold">
                N
              </AppText>
            </LinearGradient>
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: wordmarkFade }}>
          <GradientText variant="display" weight="bold" align="center" style={styles.name}>
            NEXA
          </GradientText>
        </Animated.View>

        <Animated.View style={{ opacity: taglineFade }}>
          <AppText variant="caption" tone="muted" align="center" style={styles.tagline}>
            Make your mark
          </AppText>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    opacity: 0.8,
  },
  blobA: {
    width: 230,
    height: 230,
    top: -70,
    right: -80,
    borderTopLeftRadius: 115,
    borderTopRightRadius: 100,
    borderBottomLeftRadius: 95,
    borderBottomRightRadius: 115,
  },
  blobB: {
    width: 150,
    height: 150,
    top: 170,
    left: -60,
    borderTopLeftRadius: 75,
    borderTopRightRadius: 66,
    borderBottomLeftRadius: 63,
    borderBottomRightRadius: 75,
  },
  blobC: {
    width: 190,
    height: 190,
    bottom: 30,
    right: -90,
    borderTopLeftRadius: 95,
    borderTopRightRadius: 84,
    borderBottomLeftRadius: 80,
    borderBottomRightRadius: 95,
  },
  center: {
    alignItems: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  halo: {
    position: 'absolute',
    width: LOGO_SIZE * 1.7,
    height: LOGO_SIZE * 1.7,
    borderRadius: (LOGO_SIZE * 1.7) / 2,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: radius.blob,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.pop,
  },
  name: {
    marginTop: spacing.sm,
    fontSize: typography.title,
  },
  tagline: {
    marginTop: spacing.xs,
    letterSpacing: 2,
  },
});
