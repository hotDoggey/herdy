import { MarkerView } from '@rnmapbox/maps';
import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const ICON_SIZE = 72;
const LINGER_MS = 10_000;
const FADE_OUT_MS = 600;

interface Props {
  icon: number;
  lat: number;
  lng: number;
  onComplete: () => void;
}

export default function PinLingerMarker({ icon, lat, lng, onComplete }: Props) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withDelay(
      LINGER_MS,
      withTiming(0, { duration: FADE_OUT_MS }, (f) => {
        if (f) runOnJS(onComplete)();
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <MarkerView coordinate={[lng, lat]} anchor={{ x: 0.5, y: 0.5 }}>
      <Animated.View style={[styles.container, animStyle]} pointerEvents="none">
        <Image source={icon} style={styles.image} resizeMode="contain" />
      </Animated.View>
    </MarkerView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  image: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
});
