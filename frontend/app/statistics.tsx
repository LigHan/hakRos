import { useAppStyles } from '@/lib/app-appearance';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { authorized } from '@/lib/statistics';

type Metric = 'search' | 'search_no_results' | 'card_view' | 'favorite_added' | 'like_added' | 'route_requested' | 'share_initiated';
type Role = 'admin' | 'company' | 'user';
type Data = { role: Role; counts: Record<Metric, number>; categories: { category: string; n: number }[] };

const metrics: Record<Metric, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  search: { label: 'Поиски', icon: 'search-outline' },
  search_no_results: { label: 'Поиски без результатов', icon: 'alert-circle-outline' },
  card_view: { label: 'Просмотры мест', icon: 'eye-outline' },
  favorite_added: { label: 'Добавления в избранное', icon: 'bookmark-outline' },
  like_added: { label: 'Отметки «Нравится»', icon: 'heart-outline' },
  route_requested: { label: 'Запросы маршрута', icon: 'navigate-outline' },
  share_initiated: { label: 'Нажатия «Поделиться»', icon: 'share-social-outline' },
};

const metricOrder: Record<Role, Metric[]> = {
  user: ['card_view', 'favorite_added', 'like_added', 'route_requested', 'share_initiated', 'search', 'search_no_results'],
  company: ['card_view', 'favorite_added', 'like_added', 'route_requested', 'share_initiated'],
  admin: ['card_view', 'search', 'search_no_results', 'favorite_added', 'like_added', 'route_requested', 'share_initiated'],
};

export default function StatisticsPage() {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await authorized(Platform.OS === 'android' ? '/api/statistics?scope=personal' : '/api/statistics'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const title = data?.role === 'admin' ? 'Статистика сервиса' : data?.role === 'company' ? 'Статистика компании' : 'Моя активность';
  const isEmpty = data ? metricOrder[data.role].every(metric => data.counts[metric] === 0) : false;
  const categories = data ? [...data.categories].sort((a, b) => b.n - a.n) : [];
  const maxCategory = categories[0]?.n || 1;

  return (
    <>
      <Stack.Screen options={{ title: 'Статистика', headerStyle: { backgroundColor: '#FEFAE0' }, headerTintColor: '#283618', headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.intro}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.period}><Ionicons name="calendar-outline" size={15} color="#606C38" /><Text style={styles.periodText}>Последние 30 дней</Text></View>
        </View>

        {loading ? <ActivityIndicator color="#606C38" style={styles.loading} /> : error ? (
          <View style={styles.message}>
            <Ionicons name="cloud-offline-outline" size={28} color="#606C38" />
            <Text style={styles.messageTitle}>Не удалось загрузить статистику</Text>
            <Text style={styles.info}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.button}><Text style={styles.buttonText}>Повторить</Text></Pressable>
          </View>
        ) : data ? (
          <>
            {isEmpty && (
              <View style={styles.message}>
                <View style={styles.messageIcon}><Ionicons name="analytics-outline" size={26} color="#606C38" /></View>
                <Text style={styles.messageTitle}>Пока нет событий</Text>
                <Text style={styles.info}>{data.role === 'user' ? 'Открывайте места, сохраняйте понравившиеся и стройте маршруты — здесь появится ваша активность.' : data.role === 'company' ? 'Когда пользователи начнут просматривать ваши места и взаимодействовать с ними, здесь появится статистика.' : 'Когда пользователи начнут пользоваться приложением, здесь появится статистика.'}</Text>
                {data.role === 'user' && <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/search')} style={styles.button}><Text style={styles.buttonText}>Найти места</Text></Pressable>}
              </View>
            )}

            <Text style={styles.heading}>Действия</Text>
            <View style={styles.grid}>
              {metricOrder[data.role].map(metric => (
                <View style={styles.card} key={metric}>
                  <Ionicons name={metrics[metric].icon} size={20} color="#606C38" />
                  <Text style={styles.count}>{data.counts[metric]}</Text>
                  <Text style={styles.label}>{metrics[metric].label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.heading}>Категории просмотренных мест</Text>
              {categories.length ? categories.map(category => (
                <View key={category.category} style={styles.category}>
                  <View style={styles.categoryLabel}><Text style={styles.categoryName}>{category.category}</Text><Text style={styles.categoryCount}>{category.n}</Text></View>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: `${(category.n / maxCategory) * 100}%` }]} /></View>
                </View>
              )) : <Text style={styles.info}>Категории появятся после просмотра мест.</Text>}
            </View>

            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={18} color="#6F7457" />
              <Text style={styles.noteText}>Это количество действий, а не уникальных людей. Поиски без результатов входят в общее число поисков. «Поделиться» учитывает нажатие, а не успешную отправку.</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const baseStyles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 36, gap: 16, backgroundColor: '#f7f9fc', flexGrow: 1 },
  intro: { gap: 8 },
  title: { fontSize: 26, fontWeight: '700', color: '#283618' },
  period: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  periodText: { color: '#6F7457', fontSize: 14 },
  loading: { marginTop: 32 },
  heading: { fontSize: 18, fontWeight: '700', color: '#283618' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: { width: '48.5%', minHeight: 130, backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 5 },
  count: { fontSize: 28, fontWeight: '700', color: '#283618' },
  label: { color: '#6F7457', fontSize: 13, lineHeight: 18 },
  message: { backgroundColor: '#fff', borderRadius: 16, padding: 18, alignItems: 'flex-start', gap: 10 },
  messageIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0ECCD', alignItems: 'center', justifyContent: 'center' },
  messageTitle: { fontSize: 17, fontWeight: '700', color: '#283618' },
  info: { color: '#6F7457', fontSize: 14, lineHeight: 20 },
  button: { backgroundColor: '#606C38', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11, marginTop: 2 },
  buttonText: { color: '#fff', fontWeight: '600' },
  section: { gap: 14, marginTop: 4 },
  category: { gap: 7 },
  categoryLabel: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  categoryName: { color: '#334155', flexShrink: 1 },
  categoryCount: { color: '#283618', fontWeight: '700' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#E6E8C7', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: '#606C38' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  noteText: { flex: 1, color: '#6F7457', fontSize: 12, lineHeight: 18 },
});
