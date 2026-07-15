import React, { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const ICON_SIZE = 72;
const RISE_MS = 600;
const FALL_MS = 450;

interface Props {
  icon: number;
  targetX: number;
  targetY: number;
  containerWidth: number;
  containerHeight: number;
  onLanded: () => void;
  onComplete: () => void;
}

export default function PinFlyAnimation({
  icon,
  targetX,
  targetY,
  containerWidth,
  containerHeight,
  onLanded,
  onComplete,
}: Props) {
  const startX = containerWidth * (0.2 + Math.random() * 0.6);
  const startY = containerHeight;

  const arcHeight = Math.max(160, Math.abs(startY - targetY) * 0.5);
  const peakY = targetY - arcHeight;

  const animX = useSharedValue(startX);
  const animY = useSharedValue(startY);

  useEffect(() => {
    animX.value = withTiming(
      targetX,
      { duration: RISE_MS + FALL_MS, easing: Easing.inOut(Easing.quad) },
      (finished) => {
        if (!finished) return;
        // Hand off instantly — marker appears, overlay vanishes
        runOnJS(onLanded)();
        runOnJS(onComplete)();
      },
    );

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
    opacity: 1,
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
