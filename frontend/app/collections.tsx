import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlaceCover } from '@/components/place-photo';
import { databaseService, formatPlaceRating, type Post } from '@/constants/content';
import { palette } from '@/lib/app-appearance';
import { getConnections } from '@/lib/connections';
import { getFavoritePosts, getLikedPosts } from '@/lib/likes-favorites';
import { getUserSession } from '@/lib/user-session';

type Tab = 'favorites' | 'liked' | 'subscriptions';

export default function CollectionsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('favorites');
  const [posts, setPosts] = useState<Post[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      setConnectionError('');
      try {
        const session = await getUserSession();
        if (!session) { router.replace('/login'); return; }
        const [places, saved, likedPlaces] = await Promise.all([databaseService.getPosts(), getFavoritePosts(), getLikedPosts()]);
        let followed: string[] = [];
        if (session.role === 'user') {
          try { followed = (await getConnections()).subscriptions.map(item => item.placeId); }
          catch { if (active) setConnectionError('Не удалось загрузить подписки.'); }
        }
        if (active) { setPosts(places); setFavorites(saved); setLiked(likedPlaces); setSubscriptions(followed); }
      } catch { if (active) setError('Не удалось загрузить места.'); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [router]));

  const selected = tab === 'favorites' ? favorites : tab === 'liked' ? liked : subscriptions;
  const items = posts.filter(item => selected.includes(item.id));
  return <View style={styles.page}>
    <Stack.Screen options={{ title: 'Места и подписки', headerStyle: { backgroundColor: palette.cream }, headerTintColor: palette.forest }} />
    <View style={styles.tabs}>{([['favorites', 'Сохранённые'], ['liked', 'Понравилось'], ['subscriptions', 'Подписки']] as const).map(([id, title]) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.activeTab]}><Text numberOfLines={1} style={[styles.tabText, tab === id && styles.activeText]}>{title}</Text></Pressable>)}</View>
    {loading ? <ActivityIndicator color={palette.olive} style={styles.state} /> : error || (tab === 'subscriptions' && connectionError) ? <Text accessibilityRole="alert" style={styles.stateText}>{error || connectionError}</Text> : <ScrollView contentContainerStyle={styles.list}>
      {items.length === 0 && <Text style={styles.stateText}>Здесь пока нет мест.</Text>}
      {items.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/company/[id]', params: { id: item.id } })} style={styles.row}><PlaceCover place={item} style={styles.image} compact /><View style={styles.copy}><Text style={styles.name}>{item.place}</Text><Text style={styles.rating}>★ {formatPlaceRating(item)}</Text></View><Ionicons name="chevron-forward" size={20} color={palette.olive} /></Pressable>)}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream, paddingHorizontal: 20, paddingTop: 16 },
  tabs: { flexDirection: 'row', backgroundColor: '#F1EBD1', padding: 3, borderRadius: 22 },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', borderRadius: 19, paddingVertical: 10 },
  activeTab: { backgroundColor: palette.olive },
  tabText: { color: palette.forest, fontSize: 12, fontWeight: '600' },
  activeText: { color: palette.cream },
  list: { paddingBottom: 40, paddingTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  image: { width: 104, height: 76, borderRadius: 13 },
  copy: { flex: 1, gap: 5 },
  name: { color: palette.forest, fontSize: 15, fontWeight: '700' },
  rating: { color: palette.terracotta, fontSize: 14 },
  state: { marginTop: 36 },
  stateText: { color: palette.muted, textAlign: 'center', marginTop: 28, lineHeight: 20 },
});
