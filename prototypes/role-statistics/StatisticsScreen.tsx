import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Metric = 'search' | 'search_no_results' | 'card_view' | 'share_initiated' | 'favorite_added' | 'like_added' | 'route_requested';
type Role = 'admin' | 'company' | 'user';
export type Statistics = { from: string; to: string; counts: Record<Metric, number>; categories: Record<'cafe' | 'walk' | 'event', number> };
type Props = { role: Role; data?: Statistics | null; loading?: boolean; error?: string | null; onRetry?: () => void };
const labels: Record<Metric, string> = {
  search: 'Запросы подбора', search_no_results: 'Подборы без результатов', card_view: 'Просмотры карточек', share_initiated: 'Нажатия «Поделиться»',
  favorite_added: 'Добавления в избранное', like_added: 'Отметки «Нравится»', route_requested: 'Запросы маршрута',
};
const metrics: Record<Role, Metric[]> = {
  admin: ['search', 'search_no_results', 'card_view', 'share_initiated', 'favorite_added', 'like_added', 'route_requested'],
  company: ['card_view', 'favorite_added', 'like_added', 'route_requested', 'share_initiated'],
  user: ['search', 'search_no_results', 'card_view', 'favorite_added', 'like_added', 'route_requested', 'share_initiated'],
};
const titles: Record<Role, string> = { admin: 'Статистика сервиса', company: 'Статистика ваших мест', user: 'Моя активность' };

// Presentation only. The server must authenticate and filter data before returning it.
export default function StatisticsScreen({ role, data, loading, error, onRetry }: Props) {
  return <ScrollView contentContainerStyle={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>{titles[role]}</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Загрузка статистики" /> : error ? <View style={styles.message}>
      <Text>Не удалось загрузить статистику.</Text>{onRetry ? <Pressable accessibilityRole="button" onPress={onRetry}><Text style={styles.link}>Повторить</Text></Pressable> : null}
    </View> : !data ? <Text style={styles.message}>Данные пока недоступны.</Text> : <>
      <Text style={styles.period}>Период: {data.from.slice(0, 10)} — до {data.to.slice(0, 10)} (UTC, не включая последний день)</Text>
      <View style={styles.grid}>{metrics[role].map(metric => <View key={metric} style={styles.card}>
        <Text style={styles.label}>{labels[metric]}</Text><Text style={styles.value}>{data.counts[metric]}</Text>
      </View>)}{(['cafe', 'walk', 'event'] as const).map(category => <View key={category} style={styles.card}><Text style={styles.label}>{({cafe: 'Просмотры: кафе', walk: 'Просмотры: прогулки', event: 'Просмотры: события'})[category]}</Text><Text style={styles.value}>{data.categories[category]}</Text></View>)}</View>
      <Text style={styles.caption}>Считаются действия за период. Нажатие «Поделиться» не подтверждает отправку.</Text>
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({
 page:{padding:20, gap:16, backgroundColor:'#f5f6fb', flexGrow:1}, title:{fontSize:26,fontWeight:'700',color:'#18213a'},
 period:{fontSize:13,color:'#5d6880'}, grid:{flexDirection:'row', flexWrap:'wrap',gap:12}, card:{minWidth:150,flexGrow:1,backgroundColor:'#fff',borderRadius:12,padding:16},
 label:{fontSize:14,color:'#5d6880'},value:{fontSize:30,fontWeight:'700',color:'#18213a',marginTop:8},caption:{fontSize:12,color:'#5d6880'},message:{padding:16,backgroundColor:'#fff',borderRadius:12},link:{color:'#3348c7',marginTop:12,fontWeight:'600'},
});
