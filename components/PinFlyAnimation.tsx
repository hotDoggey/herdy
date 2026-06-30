import React, { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const ICON_SIZE = 72;
const RISE_MS = 420;
const FALL_MS = 320;

interface Props {
  icon: number;
  targetX: number;
  targetY: number;
  containerWidth: number;
  containerHeight: number;
  onComplete: () => void;
}

export default function PinFlyAnimation({
  icon,
  targetX,
  targetY,
  containerWidth,
  containerHeight,
  onComplete,
}: Props) {
  // Random X between 20%–80% of width so it never hugs an edge
  const startX = containerWidth * (0.2 + Math.random() * 0.6);
  // Center of icon sits right on the bottom edge — visibly launches from there
  const startY = containerHeight;

  // Peak sits above the target — at least 160px clearance, scales with throw distance
  const arcHeight = Math.max(160, Math.abs(startY - targetY) * 0.5);
  const peakY = targetY - arcHeight;

  const animX = useSharedValue(startX);
  const animY = useSharedValue(startY);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 150 });

    // X glides smoothly to target across the full flight duration
    animX.value = withTiming(
      targetX,
      { duration: RISE_MS + FALL_MS, easing: Easing.inOut(Easing.quad) },
      (finished) => {
        if (!finished) return;
        // After landing, pause then fade out
        opacity.value = withDelay(
          320,
          withTiming(0, { duration: 180 }, (f) => {
            if (f) runOnJS(onComplete)();
          }),
        );
      },
    );

    // Y rises to peak (ease-out = slows at top) then drops to target (ease-in = accelerates down)
    animY.value = withSequence(
      withTiming(peakY, { duration: RISE_MS, easing: Easing.out(Easing.quad) }),
      withTiming(targetY, { duration: FALL_MS, easing: Easing.in(Easing.quad) }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: animX.value - ICON_SIZE / 2 },
      { translateY: animY.value - ICON_SIZE / 2 },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animStyle]} pointerEvents="none">
      <Image source={icon} style={styles.image} resizeMode="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  image: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
});
