import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SightingDetailScreen() {
  const { herdSize } = useLocalSearchParams<{ id: string; herdSize: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#111" />
        </TouchableOpacity>

        <View style={styles.headerTitle}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={20} color="#666" />
          </View>
          <Text style={styles.headerHerdSize}>{herdSize} animals</Text>
        </View>

        {/* Spacer to balance back button */}
        <View style={styles.backBtn} />
      </View>

      {/* Placeholder body */}
      <View style={styles.placeholder}>
        <Ionicons name="newspaper-outline" size={48} color="#DDD" />
        <Text style={styles.placeholderTitle}>Sighting feed coming soon</Text>
        <Text style={styles.placeholderBody}>
          Comments, photos, and reactions will live here.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFEF',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerHerdSize: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#CCC',
  },
  placeholderBody: {
    fontSize: 14,
    color: '#CCC',
    textAlign: 'center',
    lineHeight: 21,
  },
});
