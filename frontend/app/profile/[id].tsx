import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getPublicProfile, type AccountProfile } from '@/lib/account-profile';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { getConnections } from '@/lib/connections';
import { getSocialFeed, type SocialItem } from '@/lib/social';
import { SocialMedia } from '@/components/social-media';
import { usePostPreview } from '@/lib/web-post-preview';
import { webData } from '@/lib/web-data';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PublicProfile key={id} id={id} />;
}

function PublicProfile({ id }: { id: string }) {
  const router = useRouter();
  const preview = usePostPreview();
  const styles = useAppStyles(baseStyles);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [posts, setPosts] = useState<SocialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFriend, setIsFriend] = useState(false);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setIsFriend(false);
    void getConnections(controller.signal).then(connections => {
      if (!controller.signal.aborted) setIsFriend(connections.friends.some(person => person.id === id));
    }).catch(() => {});
    return () => controller.abort();
  }, [id]));

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const person = await getPublicProfile(id, controller.signal);
        if (controller.signal.aborted) return;
        setProfile(person);
        if (person.canView) {
          const feed = await getSocialFeed();
          if (!controller.signal.aborted) setPosts(feed.filter(item => item.authorId === person.id && item.kind === 'post'));
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось открыть профиль');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [id]);

  return <ScrollView {...webData({ hakrosFocus: 'public-profile' })} style={styles.page} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.back}><Ionicons name="arrow-back" color={palette.forest} size={24} /><Text style={styles.backText}>Профиль</Text></Pressable>
    {loading && !profile && <ActivityIndicator color={palette.olive} />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {profile && <>
      <View style={styles.identity}>
        {profile.avatar ? <Image source={{ uri: profile.avatar }} style={styles.avatar} /> : <View style={styles.placeholder}><Image source={require('@/assets/images/mascot-sketch.png')} style={styles.avatar} resizeMode="contain" /></View>}
        <View style={styles.identityCopy}><Text style={styles.name}>{[profile.name, profile.surname].filter(Boolean).join(' ')}</Text><Text style={styles.status}>{profile.isPrivate ? 'Приватный профиль' : 'Открытый профиль'}</Text></View>
      </View>
      {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
      {isFriend && (
        <Pressable accessibilityRole="button" style={styles.messageButton}
          onPress={() => router.push({ pathname: '/messages/[friendId]', params: { friendId: profile.id } })}>
          <Ionicons name="chatbubble-outline" size={19} color={palette.cream} />
          <Text style={styles.buttonText}>Написать</Text>
        </Pressable>
      )}
      {!profile.canView ? <View style={styles.locked}><Ionicons name="lock-closed-outline" size={34} color={palette.olive} /><Text style={styles.heading}>Закрытый профиль</Text><Text style={styles.description}>Био, публикации и истории доступны подтверждённым друзьям.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/connections')} style={styles.button}><Text style={styles.buttonText}>Найти в друзьях</Text></Pressable></View> : <View style={styles.posts}>
        <Text style={styles.heading}>Публикации</Text>
        {loading && <ActivityIndicator color={palette.olive} />}
        {!loading && !posts.length && <Text style={styles.description}>Пока нет публикаций.</Text>}
        {posts.map(item => <View key={item.id} style={styles.post}>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString('ru-RU')}</Text>
          {!!item.body && <Text style={styles.bio}>{item.body}</Text>}
          {!!(item.mediaUrl || item.imageUrl) && <SocialMedia uri={item.mediaUrl || item.imageUrl!} kind={item.mediaKind || 'image'} style={styles.postImage} />}
          {!!item.originalBody && <Text style={styles.description}>Репост: {item.originalBody}</Text>}
          <Pressable accessibilityRole="button" onPress={() => { if (!preview.open({ type: 'social', id: item.id })) router.push({ pathname: '/post/[id]', params: { id: item.id } }); }}><Text style={styles.openPost}>Открыть публикацию</Text></Pressable>
          {preview.selected?.type === 'social' && preview.selected.id === item.id && <View pointerEvents="none" style={styles.selectedShade} />}
        </View>)}
      </View>}
    </>}
  </ScrollView>;
}

const baseStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream },
  content: { padding: 22, paddingTop: 30, paddingBottom: 150, gap: 22 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
  backText: { color: palette.forest, fontSize: 23, fontWeight: '700' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 17 },
  identityCopy: { flex: 1, gap: 8 },
  avatar: { width: 90, height: 90, borderRadius: 45 },
  placeholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F0ECCD', alignItems: 'center', justifyContent: 'center' },
  name: { color: palette.forest, fontSize: 23, fontWeight: '700', flexShrink: 1 },
  status: { color: palette.muted, fontSize: 13 },
  bio: { color: palette.forest, fontSize: 16, lineHeight: 24 },
  locked: { alignItems: 'center', paddingVertical: 30, gap: 14 },
  heading: { color: palette.forest, fontSize: 21, fontWeight: '700' },
  description: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  button: { backgroundColor: palette.olive, paddingVertical: 13, paddingHorizontal: 22, borderRadius: 15 },
  buttonText: { color: palette.cream, fontWeight: '700' },
  messageButton: { minHeight: 46, alignSelf: 'flex-start', paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: palette.olive, flexDirection: 'row', alignItems: 'center', gap: 8 },
  posts: { gap: 15 },
  post: { backgroundColor: palette.surface, padding: 15, borderRadius: 18, gap: 10 },
  selectedShade: { ...StyleSheet.absoluteFill, borderRadius: 18, backgroundColor: 'rgba(20, 25, 14, 0.16)' },
  date: { color: palette.muted, fontSize: 12 },
  postImage: { width: '100%', height: 220, borderRadius: 12 },
  openPost: { color: palette.olive, fontWeight: '700', fontSize: 14 },
  error: { color: '#A23524', lineHeight: 22 },
});
