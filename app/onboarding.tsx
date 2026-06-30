import React, { useRef, useState, useCallback } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#3C8C7C';
const HEADLINE_COLOR = '#1A4D3C';
const DOT_INACTIVE = '#C8DFD9';

const SLIDES = [
  {
    key: '1',
    image: require('../assets/walkthrough_screens_image_1_heatmap_showcase.png') as number,
    showBranding: true,
    headline: 'Find the herd\nbefore you set off.',
    bodyHighlight: null as string | null,
    bodyBefore: 'Real-time sightings from other walkers in Fanal. See the heatmap of recent activity.',
    bodyAfter: '',
    badge: null as string | null,
  },
  {
    key: '2',
    image: require('../assets/walkthrough_screens_image_2_recent_pins.png') as number,
    showBranding: false,
    headline: 'Saw them? Drop a pin\nfor the next walker.',
    bodyHighlight: null as string | null,
    bodyBefore: 'Anonymous sightings that fade after 4 hours. No account needed—just tap and contribute to the herd map.',
    bodyAfter: '',
    badge: 'AUTO-EXPIRING TAGS' as string | null,
  },
  {
    key: '3',
    image: require('../assets/walkthrough_screens_image_3_locations_showcase.png') as number,
    showBranding: false,
    headline: 'Walk softly.\nThis place is ancient.',
    bodyHighlight: null as string | null,
    bodyBefore: 'Fanal is a UNESCO site. Staying on the path prevents root damage and protects the laurel ecosystem.',
    bodyAfter: '',
    badge: null as string | null,
  },
];

type Slide = typeof SLIDES[number];

export default function OnboardingScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<Animated.FlatList<Slide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);

  const imageHeight = Math.round(screenHeight * 0.55);
  const isLast = currentIndex === SLIDES.length - 1;

  const completeOnboarding = useCallback(async () => {
    await SecureStore.setItemAsync('herdy.onboardingComplete', 'true');
    router.replace('/(tabs)');
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) {
      const nextIndex = currentIndex + 1;
      // Update index immediately so button label switches without waiting for scroll to settle
      setCurrentIndex(nextIndex);
      (flatListRef.current as any)?.scrollToIndex({ index: nextIndex, animated: true });
    } else {
      completeOnboarding();
    }
  }, [currentIndex, completeOnboarding]);

  const handleMomentumScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
      setCurrentIndex(index);
    },
    [screenWidth],
  );

  const renderItem = useCallback(
    ({ item }: { item: Slide }) => (
      <View style={{ width: screenWidth }}>
        {/* Image */}
        <View style={{ width: screenWidth, height: imageHeight }}>
          <Image
            source={item.image}
            style={styles.slideImage}
            resizeMode="cover"
          />
          {item.showBranding && (
            <Text style={[styles.brandingText, { top: insets.top + 18, left: 22 }]}>
              Herdy
            </Text>
          )}
        </View>

        {/* Text content */}
        <View style={styles.slideContent}>
          <Text style={styles.headline}>{item.headline}</Text>

          <Text style={styles.body}>
            {item.bodyBefore}
            {item.bodyHighlight ? (
              <Text style={styles.bodyHighlight}>{item.bodyHighlight}</Text>
            ) : null}
            {item.bodyAfter}
          </Text>

          {item.badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeIcon}>⏱</Text>
              <Text style={styles.badgeText}>{item.badge}</Text>
            </View>
          )}
        </View>
      </View>
    ),
    [screenWidth, imageHeight, insets.top],
  );

  return (
    <View style={styles.root}>
      {/* Skip — top right, only shown on first slide */}
      {currentIndex === 0 && (
        <TouchableOpacity
          style={[styles.skipBtn, { top: insets.top + 14 }]}
          onPress={completeOnboarding}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        bounces={false}
        style={{ flex: 1 }}
      />

      {/* Bottom nav */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom + 20 }]}>
        {/* Animated dot indicators */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => {
            const dotWidth = scrollX.interpolate({
              inputRange: [
                (i - 1) * screenWidth,
                i * screenWidth,
                (i + 1) * screenWidth,
              ],
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const bgColor = scrollX.interpolate({
              inputRange: [
                (i - 1) * screenWidth,
                i * screenWidth,
                (i + 1) * screenWidth,
              ],
              outputRange: [DOT_INACTIVE, TEAL, DOT_INACTIVE],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, backgroundColor: bgColor }]}
              />
            );
          })}
        </View>

        {/* Next / Get started */}
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>
            {isLast ? 'Get started' : 'Next'}
          </Text>
          <Text style={styles.nextArrow}>  →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },

  slideImage: {
    width: '100%',
    height: '100%',
  },

  brandingText: {
    position: 'absolute',
    fontSize: 26,
    fontWeight: '800',
    color: HEADLINE_COLOR,
    letterSpacing: -0.5,
  },

  slideContent: {
    paddingHorizontal: 28,
    paddingTop: 28,
  },

  headline: {
    fontSize: 34,
    fontWeight: '800',
    color: HEADLINE_COLOR,
    letterSpacing: -0.5,
    lineHeight: 40,
    marginBottom: 14,
  },

  body: {
    fontSize: 15,
    color: '#555',
    lineHeight: 23,
    fontWeight: '400',
  },

  bodyHighlight: {
    color: TEAL,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 7,
    backgroundColor: '#FAFAFA',
  },

  badgeIcon: {
    fontSize: 13,
  },

  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  skipBtn: {
    position: 'absolute',
    right: 22,
    zIndex: 10,
    padding: 6,
  },

  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEAL,
  },

  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 16,
    backgroundColor: '#fff',
  },

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  dot: {
    height: 8,
    borderRadius: 4,
  },

  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TEAL,
    borderRadius: 100,
    paddingVertical: 14,
    paddingHorizontal: 26,
  },

  nextBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  nextArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
