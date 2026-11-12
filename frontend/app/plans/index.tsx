import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { formatPlanDate, listPlans, type LeisurePlan } from '@/lib/leisure-plans';

export default function PlansScreen() {
  const router = useRouter();
  const [plans, setPlans] = useState<LeisurePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let current = true;
    setLoading(true);
    listPlans().then(result => { if (current) { setPlans(result); setError(''); } })
      .catch(() => { if (current) setError('Не удалось загрузить планы. Проверь подключение и вход.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []));
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Stack.Screen options={{ title: 'Планы и приглашения' }} />
    <Text style={styles.title}>Пойдём вместе</Text>
    <Text style={styles.subtitle}>Твои планы и приглашения от друзей.</Text>
    {loading && <ActivityIndicator color="#606c38" />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!loading && !error && plans.length === 0 && <Text style={styles.subtitle}>Пока планов нет. Открой место или попроси помощника предложить варианты.</Text>}
    {plans.map(plan => <Pressable key={plan.id} accessibilityRole="button" accessibilityLabel={`Открыть план ${plan.placeName || 'место недоступно'}`} onPress={() => router.push({ pathname: '/plans/[id]', params: { id: plan.id } })} style={styles.card}>
      <Text style={styles.cardTitle}>{plan.placeName || 'Место недоступно'}</Text>
      <Text style={styles.subtitle}>{formatPlanDate(plan.startsAt, plan.timeZone)}</Text>
      <Text style={styles.tag}>{plan.status === 'cancelled' ? 'Встреча отменена' : plan.invitationStatus === 'pending' ? 'Приглашение — ответь' : plan.invitationStatus === 'accepted' ? 'Ты идёшь' : 'Твой план'}</Text>
    </Pressable>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8f7ed' }, content: { padding: 20, paddingBottom: 150, gap: 12 },
  title: { fontSize: 25, fontWeight: '800', color: '#283618' }, subtitle: { fontSize: 14, lineHeight: 21, color: '#647052' },
  card: { backgroundColor: '#fffdf3', borderRadius: 18, borderWidth: 1, borderColor: '#e4e8d6', padding: 16, gap: 6 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#283618' }, tag: { color: '#a45d20', fontWeight: '600', fontSize: 12 },
  error: { color: '#a24035', fontSize: 14 },
});
