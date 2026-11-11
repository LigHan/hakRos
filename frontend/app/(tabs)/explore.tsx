import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { Collapsible } from '@/components/ui/collapsible';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

const FOOTSTEP_COUNT = 12;

type FootstepConfig = {
  top: number;
  left: number;
  rotation: number;
  delay: number;
};

export default function TabTwoScreen() {
  return (
    <View style={styles.screen}>
      <FootstepTrail />
      <ParallaxScrollView
        headerBackgroundColor={{ light: '#d8e2ff', dark: '#1f2437' }}
        headerImage={
          <IconSymbol
            size={310}
            color="#94a3b8"
            name="chevron.left.forwardslash.chevron.right"
            style={styles.headerImage}
          />
        }>
        <View style={[styles.glassCard, styles.heroCard]}>
          <ThemedText type="title" style={styles.heroTitle}>
            Explore
          </ThemedText>
          <ThemedText style={styles.heroSubtitle}>
            Откройте новые локации, вдохновляйтесь маршрутами и собирайте свои любимые места.
          </ThemedText>
        </View>

        <View style={styles.glassCard}>
          <ThemedText>This app includes example code to help you get started.</ThemedText>
        </View>

        <View style={styles.glassCard}>
          <Collapsible title="File-based routing">
            <ThemedText>
              This app has two screens: <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> and{' '}
              <ThemedText type="defaultSemiBold">app/(tabs)/explore.tsx</ThemedText>
            </ThemedText>
            <ThemedText>
              The layout file in <ThemedText type="defaultSemiBold">app/(tabs)/_layout.tsx</ThemedText> sets up the tab
              navigator.
            </ThemedText>
            <ExternalLink href="https://docs.expo.dev/router/introduction">
              <ThemedText type="link">Learn more</ThemedText>
            </ExternalLink>
          </Collapsible>
        </View>

        <View style={styles.glassCard}>
          <Collapsible title="Android, iOS, and web support">
            <ThemedText>
              You can open this project on Android, iOS, and the web. To open the web version, press{' '}
              <ThemedText type="defaultSemiBold">w</ThemedText> in the terminal running this project.
            </ThemedText>
          </Collapsible>
        </View>

        <View style={styles.glassCard}>
          <Collapsible title="Images">
            <ThemedText>
              For static images, you can use the <ThemedText type="defaultSemiBold">@2x</ThemedText> and{' '}
              <ThemedText type="defaultSemiBold">@3x</ThemedText> suffixes to provide files for different screen densities
            </ThemedText>
            <Image source={require('@/assets/images/react-logo.png')} style={styles.logo} />
            <ExternalLink href="https://reactnative.dev/docs/images">
              <ThemedText type="link">Learn more</ThemedText>
            </ExternalLink>
          </Collapsible>
        </View>

        <View style={styles.glassCard}>
          <Collapsible title="Light and dark mode components">
            <ThemedText>
              This template has light and dark mode support. The <ThemedText type="defaultSemiBold">useColorScheme()</ThemedText>{' '}
              hook lets you inspect what the user&apos;s current color scheme is, and so you can adjust UI colors accordingly.
            </ThemedText>
            <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/">
              <ThemedText type="link">Learn more</ThemedText>
            </ExternalLink>
          </Collapsible>
        </View>

        <View style={styles.glassCard}>
          <Collapsible title="Animations">
            <ThemedText>
              This template includes an example of an animated component. The{' '}
              <ThemedText type="defaultSemiBold">components/HelloWave.tsx</ThemedText> component uses the powerful{' '}
              <ThemedText type="defaultSemiBold" style={{ fontFamily: Fonts.mono }}>
                react-native-reanimated
              </ThemedText>{' '}
              library to create a waving hand animation.
            </ThemedText>
            {Platform.select({
              ios: (
                <ThemedText>
                  The <ThemedText type="defaultSemiBold">components/ParallaxScrollView.tsx</ThemedText> component provides a
                  parallax effect for the header image.
                </ThemedText>
              ),
            })}
          </Collapsible>
        </View>
      </ParallaxScrollView>
    </View>
  );
}

function FootstepTrail() {
  const steps = useMemo<FootstepConfig[]>(() => {
    return Array.from({ length: FOOTSTEP_COUNT }, (_, index) => {
      const offset = index % 2 === 0 ? -8 : 8;
      return {
        top: 6 + index * 7,
        left: 22 + (index % 3) * 18 + offset * 0.1,
        rotation: index % 2 === 0 ? -18 : 18,
        delay: index * 220,
      };
    });
  }, []);

  return (
    <View style={styles.trailContainer} pointerEvents="none">
      {steps.map((config, index) => (
        <Footstep key={index} {...config} />
      ))}
    </View>
  );
}

function Footstep({ top, left, rotation, delay }: FootstepConfig) {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(900),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(450),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [delay, opacity]);

  return (
    <Animated.View
      style={[
        styles.footstep,
        {
          opacity,
          top: `${top}%`,
          left: `${left}%`,
          transform: [{ rotate: `${rotation}deg` }],
        },
      ]}>
      <View style={styles.footHeel} />
      <View style={styles.footToe} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f172a',
    position: 'relative',
  },
  trailContainer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    justifyContent: 'center',
    zIndex: -1,
  },
  footstep: {
    position: 'absolute',
    width: 46,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footHeel: {
    width: 28,
    height: 38,
    borderRadius: 18,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
  },
  footToe: {
    width: 20,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
    marginTop: -8,
  },
  headerImage: {
    color: '#94a3b8',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    marginBottom: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 20 },
    elevation: 14,
  },
  heroCard: {
    gap: 12,
    paddingTop: 28,
    paddingBottom: 32,
  },
  heroTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 32,
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: '#1e293b',
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: 'center',
  },
});
