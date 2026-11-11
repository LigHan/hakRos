import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { AssistantLauncher, MascotIcon } from '@/components/assistant/AssistantLauncher';

export default function AssistantPreview() {
  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: 'Помощник' }} />
      <View style={styles.card}>
        <MascotIcon size={64} />
        <Text style={styles.eyebrow}>ТВОЙ ГОРОД · ТВОЁ ВРЕМЯ</Text>
        <Text style={styles.heading}>Куда пойдём{ '\n' }после пар?</Text>
        <Text style={styles.description}>Расскажи помощнику о своих интересах, времени и бюджете — и начнём искать идеи вместе.</Text>
        <View style={styles.example}><Text style={styles.exampleText}>«Есть два часа и 500 рублей»</Text></View>
        <Text style={styles.hint}>Перетащи маскота вдоль нижней панели или нажми, чтобы открыть чат.</Text>
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.demoDock}>
        <Ionicons name="home-outline" size={23} color="#687451" />
        <Ionicons name="map-outline" size={23} color="#687451" />
        <View style={styles.searchIcon}><Ionicons name="search" size={22} color="#fffdf4" /></View>
        <Ionicons name="person-outline" size={23} color="#687451" />
        <Ionicons name="location-outline" size={23} color="#687451" />
      </View>
      <AssistantLauncher />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f4f4e9', padding: 20 },
  card: { marginTop: 28, backgroundColor: '#fdfbf0', borderRadius: 26, padding: 24, gap: 15, borderWidth: 1, borderColor: '#eaeddb' },
  eyebrow: { color: '#899263', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 3 },
  heading: { color: '#27351e', fontSize: 31, lineHeight: 38, fontWeight: '800' },
  description: { color: '#758061', fontSize: 15, lineHeight: 23 },
  example: { backgroundColor: '#edf0dd', alignSelf: 'flex-start', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12, marginTop: 4 },
  exampleText: { color: '#58683c', fontSize: 12, fontWeight: '600' },
  hint: { color: '#8b947b', fontSize: 12, lineHeight: 18 },
  demoDock: { position: 'absolute', bottom: 12, alignSelf: 'center', width: '86%', maxWidth: 420, height: 68, borderRadius: 34, backgroundColor: '#fffdf6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderWidth: 1, borderColor: '#e7e9da' },
  searchIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#68743d' },
});
