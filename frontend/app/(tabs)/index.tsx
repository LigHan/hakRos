import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SketchFrame } from '@/components/sketch-frame';
import { databaseService, type Post, type Story } from '@/constants/content';
import { palette, useAppStyles, useAppearance } from '@/lib/app-appearance';
import { matchesPlaceCategory, placeCategories } from '@/lib/place-categories';
import { getConnections } from '@/lib/connections';
import { selectSubscribedPlaces } from '@/lib/connections-feed';
import { getUserSession } from '@/lib/user-session';
import { getFavoritePosts, toggleFavorite } from '@/lib/likes-favorites';

/** Until ranking rules are agreed, show available places without claiming personalization. */
export default function RecommendationsScreen() {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useAppearance();
  const [category, setCategory] = useState('all');
  const [places, setPlaces] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesState, setStoriesState] = useState<'guest' | 'ready' | 'error'>('guest');
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [savingFavorite, setSavingFavorite] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const posts = await databaseService.getPosts();
      setPlaces(posts);
      const session = await getUserSession();
      setFavorites(session ? await getFavoritePosts() : []);
      if (session?.role === 'user') {
        try {
          const [connections, publicStories] = await Promise.all([getConnections(), databaseService.getStories()]);
          setStories(selectSubscribedPlaces(posts, publicStories, connections).stories);
          setStoriesState('ready');
        } catch {
          setStories([]);
          setStoriesState('error');
        }
      } else {
        setStories([]);
        setStoriesState('guest');
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const savePlace = async (id: string) => {
    if (savingFavorite) return;
    setSavingFavorite(id);
    try {
      const result = await toggleFavorite(id);
      if (result.requiresAuth) { router.push('/login'); return; }
      if (!result.success) { Alert.alert('Не удалось сохранить место', 'Попробуйте ещё раз.'); return; }
      setFavorites(await getFavoritePosts());
    } finally { setSavingFavorite(null); }
  };

  const filtered = useMemo(() => places.filter(place => matchesPlaceCategory(place, category)), [places, category]);

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 30) }]}>
        <View style={styles.heading}>
          <Text style={styles.title}>Рекомендации</Text>
          <Text style={styles.subtitle}>Идеи, чем заняться после пар</Text>
        </View>
        {mode === 'sketch' && <Image source={require('@/assets/images/mascot-sketch.png')} style={styles.mascot} accessibilityLabel="Маскот приложения" />}
      </View>
      {loading ? <View style={styles.state}><ActivityIndicator color={palette.olive} /><Text style={styles.stateText}>Загружаем места...</Text></View> : error ? (
        <View style={styles.state}><Ionicons name="cloud-offline-outline" size={36} color={palette.olive} /><Text style={styles.stateText}>Не удалось загрузить места. Проверьте соединение.</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Попробовать снова</Text></Pressable></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<View>
            <View style={styles.storySection}>
              <Text style={styles.storyHeading}>Истории</Text>
              <FlatList horizontal data={stories} keyExtractor={item => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyList} ListHeaderComponent={<Pressable accessibilityRole="button" accessibilityLabel="Моя история" onPress={() => router.push({ pathname: '/create', params: { kind: 'story' } })} style={styles.storyItem}><View style={styles.myStory}><Ionicons name="add" size={26} color={palette.forest} /></View><Text style={styles.storyName}>Моя история</Text></Pressable>} renderItem={({ item }) => (
                <Pressable accessibilityRole="button" accessibilityLabel={`История ${item.userName}`} onPress={() => setActiveStory(item)} style={styles.storyItem}>
                  <View style={styles.storyRing}><Image source={{ uri: item.avatar }} style={styles.storyAvatar} /></View>
                  <Text numberOfLines={1} style={styles.storyName}>{item.userName}</Text>
                </Pressable>
              )} />
              {stories.length === 0 && storiesState !== 'error' && <Text style={styles.storyHint}>Здесь появятся истории заведений из ваших подписок</Text>}
            </View>
            {storiesState === 'error' && <Text accessibilityRole="alert" style={styles.storyError}>Истории подписок недоступны. Проверьте соединение или войдите снова.</Text>}
            <FlatList horizontal data={placeCategories} keyExtractor={item => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} renderItem={({ item }) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: category === item.id }} onPress={() => setCategory(item.id)} style={[styles.filter, category === item.id && styles.filterActive]}><Text style={[styles.filterText, category === item.id && styles.filterTextActive]}>{item.name}</Text></Pressable>
            )} />
            <Text style={styles.note}>Все доступные места · без персонального подбора</Text>
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/nearby')} style={styles.nearbyLink}><Ionicons name="location-outline" size={17} color={palette.olive} /><Text style={styles.nearbyText}>Места рядом</Text></Pressable>
          </View>}
          ListEmptyComponent={<View style={styles.state}><Ionicons name="leaf-outline" size={36} color={palette.olive} /><Text style={styles.stateText}>{places.length ? 'В этой категории пока нет мест' : 'Пока нет доступных мест'}</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.post}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Открыть ${item.place}`} onPress={() => router.push({ pathname: '/company/[id]', params: { id: item.id } })} style={styles.photoWrap}>
                <Image source={{ uri: item.image }} style={styles.photo} />
                <LinearGradient colors={['transparent', 'rgba(20, 25, 14, 0.78)']} style={styles.photoShade} />
                <View style={styles.photoCaption}><Ionicons name="location" size={15} color="#fff" /><Text numberOfLines={1} style={styles.photoPlace}>{item.place}</Text><Text style={styles.photoRating}>★ <Text style={styles.photoRatingValue}>{item.rating.toFixed(1).replace('.', ',')}</Text></Text></View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={favorites.includes(item.id) ? `Убрать ${item.place} из избранного` : `Сохранить ${item.place}`} disabled={!!savingFavorite} onPress={() => void savePlace(item.id)} style={styles.bookmark}>
                <Ionicons name={favorites.includes(item.id) ? 'bookmark' : 'bookmark-outline'} size={23} color="#fff" />
              </Pressable>
              <View style={styles.cardBody}>
                <View style={styles.cardInfo}><Text style={styles.cardTitle}>{item.place}</Text><Text numberOfLines={2} style={styles.address}>{item.bio || item.address || 'Адрес не указан'}</Text>
                  <View style={styles.tags}>{item.tags.slice(0, 2).map(tag => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Подробнее: ${item.place}`} onPress={() => router.push({ pathname: '/company/[id]', params: { id: item.id } })} style={styles.cardArrow}><Ionicons name="arrow-forward" size={21} color={palette.cream} /></Pressable>
              </View>
              <SketchFrame />
            </View>
          )}
        />
      )}
      <Modal visible={!!activeStory} transparent animationType="fade" onRequestClose={() => setActiveStory(null)}>
        <View style={styles.storyOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть историю" style={StyleSheet.absoluteFill} onPress={() => setActiveStory(null)} />
          {activeStory && <View style={styles.storyCard}>
            <Image source={{ uri: activeStory.image }} style={styles.storyImage} />
            <View style={styles.storyContent}><Text style={styles.storyTitle}>{activeStory.userName}</Text><Text style={styles.storyText}>{activeStory.text}</Text>
              <Pressable accessibilityRole="button" onPress={() => { const postId = activeStory.postId; setActiveStory(null); router.push({ pathname: '/company/[id]', params: { id: postId } }); }} style={styles.storyAction}><Text style={styles.storyActionText}>Открыть место</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setActiveStory(null)} style={styles.storyClose}><Text style={styles.storyCloseText}>Закрыть</Text></Pressable>
            </View>
          </View>}
        </View>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream },
  header: { paddingHorizontal: 20, paddingTop: 38, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  heading: { flex: 1 },
  title: { color: palette.forest, fontWeight: '800', fontSize: 27, lineHeight: 36 },
  subtitle: { color: palette.muted, fontSize: 14, marginTop: 2 },
  mascot: { width: 62, height: 62, resizeMode: 'contain' },
  storySection: { gap: 10, paddingTop: 18 },
  storyHeading: { color: palette.forest, fontSize: 17, fontWeight: '700' },
  storyList: { gap: 13 },
  storyItem: { width: 70, alignItems: 'center', gap: 6 },
  storyRing: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: palette.terracotta, padding: 3 },
  myStory: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9E8C6' },
  storyAvatar: { width: '100%', height: '100%', borderRadius: 28 },
  storyName: { color: palette.forest, fontSize: 11, textAlign: 'center' },
  storyHint: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  storyError: { color: '#A23524', fontSize: 12, lineHeight: 18, marginTop: 14 },
  storyOverlay: { flex: 1, backgroundColor: 'rgba(20,29,12,0.7)', justifyContent: 'center', padding: 20 },
  storyCard: { backgroundColor: palette.cream, borderRadius: 24, overflow: 'hidden', width: '100%', maxWidth: 400, alignSelf: 'center' },
  storyImage: { width: '100%', height: 280 },
  storyContent: { padding: 20, gap: 10 },
  storyTitle: { color: palette.forest, fontSize: 20, fontWeight: '800' },
  storyText: { color: palette.forest, fontSize: 15, lineHeight: 22 },
  storyAction: { alignItems: 'center', borderRadius: 15, backgroundColor: palette.olive, padding: 12, marginTop: 4 },
  storyActionText: { color: palette.cream, fontWeight: '700' },
  storyClose: { alignItems: 'center', padding: 8 },
  storyCloseText: { color: palette.muted, fontWeight: '600' },
  filters: { gap: 8, paddingTop: 16, paddingBottom: 3 },
  filter: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: '#F0ECCD' },
  filterActive: { backgroundColor: palette.olive },
  filterText: { color: palette.forest, fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: palette.cream },
  list: { paddingHorizontal: 20, paddingBottom: 125, gap: 22 },
  note: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 12, marginBottom: 3 },
  nearbyLink: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 7 },
  nearbyText: { color: palette.olive, fontSize: 14, fontWeight: '700' },
  post: { backgroundColor: palette.cream, borderRadius: 20, position: 'relative' },
  photoWrap: { height: 180, borderRadius: 17, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  photoCaption: { position: 'absolute', bottom: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  photoPlace: { color: '#fff', fontWeight: '700', fontSize: 13, flex: 1 },
  photoRating: { color: palette.sand, fontSize: 16, fontWeight: '800' },
  photoRatingValue: { color: '#fff', fontSize: 13 },
  bookmark: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(25, 28, 18, 0.48)', alignItems: 'center', justifyContent: 'center' },
  cardBody: { paddingHorizontal: 8, paddingTop: 9, paddingBottom: 5, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  cardInfo: { flex: 1, gap: 4 },
  cardTitle: { color: palette.forest, fontSize: 18, fontWeight: '700' },
  cardArrow: { backgroundColor: palette.terracotta, width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  address: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 3 },
  tag: { color: palette.forest, fontSize: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#F0ECCD' },
  state: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 12 },
  stateText: { color: palette.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  retry: { backgroundColor: palette.olive, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: palette.cream, fontWeight: '700' },
});
