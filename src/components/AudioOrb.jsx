import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

function WaveBar({ delay, active, baseHeight = 12, maxHeight = 48 }) {
  const height = useSharedValue(baseHeight);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    if (active) {
      height.value = withRepeat(
        withSequence(
          withTiming(maxHeight, {
            duration: 400 + delay * 80,
            easing: Easing.bezier(0.42, 0, 0.58, 1),
          }),
          withTiming(baseHeight + 6, {
            duration: 350 + delay * 60,
            easing: Easing.bezier(0.42, 0, 0.58, 1),
          })
        ),
        -1,
        true
      );
      opacity.value = withTiming(1, { duration: 300 });
    } else {
      height.value = withTiming(baseHeight, { duration: 400 });
      opacity.value = withTiming(0.4, { duration: 400 });
    }
  }, [active, delay, baseHeight, maxHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.waveBar, animatedStyle]} />;
}

export function AudioOrb({ active = false, size = 180 }) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (active) {
      pulseScale.value = withRepeat(
        withTiming(1.25, { duration: 1200, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 600 }),
          withTiming(0.1, { duration: 600 })
        ),
        -1,
        false
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 500 });
      pulseOpacity.value = withTiming(0.2, { duration: 500 });
    }
  }, [active]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const orbRadius = size / 2;
  const barDelays = [0, 2, 1, 4, 3, 1, 0];
  const maxHeights = [36, 52, 68, 80, 64, 48, 32];
  const baseHeights = [10, 16, 20, 24, 18, 14, 8];

  return (
    <View style={[styles.container, { width: size + 60, height: size + 60 }]}>
      {/* Outer Glowing Aura Pulse */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            width: size + 40,
            height: size + 40,
            borderRadius: (size + 40) / 2,
          },
          animatedPulseStyle,
        ]}
      />

      {/* Main Gradient Orb */}
      <LinearGradient
        colors={
          active
            ? ['#A084DC', '#6C5CE7', '#4834D4']
            : ['#C4B8F3', '#8A75F5', '#6C5CE7']
        }
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            borderRadius: orbRadius,
          },
        ]}
      >
        {/* Ambient Inner Gloss Highlight */}
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
          start={{ x: 0.3, y: 0.1 }}
          end={{ x: 0.5, y: 0.6 }}
          style={[styles.gloss, { width: size * 0.7, height: size * 0.45 }]}
        />

        {/* Animated Sound Waves inside Orb */}
        <View style={styles.waveContainer}>
          {barDelays.map((delay, idx) => (
            <WaveBar
              key={idx}
              delay={delay}
              active={active}
              baseHeight={baseHeights[idx]}
              maxHeight={maxHeights[idx]}
            />
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    backgroundColor: '#8A75F5',
  },
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
  },
  gloss: {
    position: 'absolute',
    top: 6,
    borderRadius: 999,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 90,
  },
  waveBar: {
    width: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
});
