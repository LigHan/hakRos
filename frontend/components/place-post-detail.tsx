import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { databaseService, type Post } from '@/constants/content';
import { PlaceCover } from '@/components/place-photo';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { track } from '@/lib/statistics';

export function PlacePostDetail({ id, embedded = false, onClose }: { id: string; embedded?: boolean; onClose?: () => void }) {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    databaseService.getPostById(id).then(value => {
      if (!active) return;
      setPost(value);
      if (!value) setError('Публикация не найдена');
      else track('card_view', value.id);
    }).catch(() => { if (active) setError('Не удалось загрузить публикацию. Попробуйте открыть её ещё раз.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  return <View style={styles.page}>
    {loading ? <ActivityIndicator style={styles.loading} color={palette.olive} /> : error || !post ? <Text style={styles.error}>{error}</Text> : <ScrollView contentContainerStyle={[styles.content, embedded && styles.embeddedContent]}>
      <View style={styles.card}>
        <PlaceCover place={post} style={styles.image} />
        <View style={styles.body}>
          <Text style={styles.title}>{post.place}</Text>
          <Text style={styles.description}>{post.bio || 'Узнайте больше об этом месте.'}</Text>
          {!!post.address && <Text style={styles.address}>{post.address}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel={`Перейти в профиль ${post.user || post.place}`} onPress={() => { onClose?.(); router.push({ pathname: '/company/[id]', params: { id: post.id } }); }} style={styles.profileLink}>
            {post.userAvatar ? <Image source={{ uri: post.userAvatar }} style={styles.avatar} /> : <Ionicons name="storefront-outline" size={30} color={palette.olive} />}
            <View style={styles.profileText}><Text style={styles.author}>{post.user || post.place}</Text><Text style={styles.link}>Открыть профиль заведения</Text></View><Ionicons name="chevron-forward" size={20} color={palette.olive} />
          </Pressable>
        </View>
      </View>
    </ScrollView>}
  </View>;
}

const baseStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream }, loading: { marginTop: 45 }, error: { color: palette.muted, padding: 24, lineHeight: 22 },
  content: { padding: 18, paddingBottom: 145 }, card: { backgroundColor: palette.surface, borderRadius: 22, position: 'relative' },
  embeddedContent: { paddingBottom: 30 },
  image: { width: '100%', aspectRatio: 1.25, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  body: { padding: 18, gap: 16 }, title: { color: palette.forest, fontSize: 26, lineHeight: 35, fontWeight: '800' },
  description: { color: palette.forest, fontSize: 16, lineHeight: 24 }, address: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  profileLink: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderColor: palette.border, paddingTop: 17 },
  avatar: { width: 44, height: 44, borderRadius: 22 }, profileText: { flex: 1, gap: 3, minWidth: 0 }, author: { color: palette.forest, fontWeight: '700', fontSize: 15 }, link: { color: palette.olive, fontSize: 13 },
});
