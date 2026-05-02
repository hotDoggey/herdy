import { StyleSheet, Text, View } from 'react-native';

// Sightings feed — placeholder until Step 7
export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Sightings feed coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  text: { color: '#666' },
});
