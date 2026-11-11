import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SocialMedia } from '@/components/social-media';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { addSocialComment, getSocialComments, getSocialItem, setSocialLike, socialRequestId, type SocialComment, type SocialItem } from '@/lib/social';

export default function SocialPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SocialPost key={id} id={id} />;
}

function SocialPost({ id }: { id: string }) {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const [item, setItem] = useState<SocialItem | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [text, setText] = useState('');
  const [pendingComment, setPendingComment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const [post, values] = await Promise.all([getSocialItem(id), getSocialComments(id)]); setItem(post); setComments(values); setError(''); }
    catch { setItem(null); setError('Публикация недоступна или не удалось подключиться к серверу.'); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const like = async () => {
    if (!item || busy) return;
    setBusy(true); setError('');
    try { setItem(await setSocialLike(item.id, !item.liked)); }
    catch { setError('Не удалось изменить отметку. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  };
  const comment = async () => {
    if (!item || !text.trim() || busy) return;
    const requestId = pendingComment ?? socialRequestId();
    setPendingComment(requestId); setBusy(true); setError('');
    try {
      await addSocialComment(item.id, text.trim(), requestId);
      setComments(await getSocialComments(item.id)); setItem(await getSocialItem(item.id));
      setPendingComment(null); setText('');
    } catch { setError('Не удалось подтвердить комментарий. Повторная отправка не создаст дубликат.'); }
    finally { setBusy(false); }
  };
  const openProfile = () => {
    if (!item) return;
    if (item.placeId) router.push({ pathname: '/company/[id]', params: { id: item.placeId } });
    else router.push({ pathname: '/profile/[id]', params: { id: item.authorId } });
  };
  return <View style={styles.page}>
    <Stack.Screen options={{ title: 'Публикация' }} />
    {loading ? <ActivityIndicator style={styles.loading} color={palette.olive} /> : !item ? <View style={styles.content}><Text style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.link}>Повторить</Text></Pressable></View> : <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.title}>{item.placeName || item.authorName}</Text>
        <Text style={styles.date}>{new Date(item.createdAt).toLocaleString('ru-RU')}</Text>
        {!!item.body && <Text style={styles.body}>{item.body}</Text>}
        {(item.mediaUrl || item.imageUrl) && <SocialMedia uri={(item.mediaUrl || item.imageUrl)!} kind={item.mediaKind || 'image'} style={styles.media} onRetry={() => void load()} />}
        {!!item.originalId && <View style={styles.quote}><Text style={styles.author}>{item.originalAuthorName}</Text><Text style={styles.body}>{item.originalBody}</Text>{(item.originalMediaUrl || item.originalImageUrl) && <SocialMedia uri={(item.originalMediaUrl || item.originalImageUrl)!} kind={item.originalMediaKind || 'image'} style={styles.media} onRetry={() => void load()} />}</View>}
        <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel={item.liked ? 'Убрать лайк' : 'Нравится'} disabled={busy} onPress={() => void like()} style={styles.action}><Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={24} color={palette.terracotta} /><Text style={styles.body}>{item.likes}</Text></Pressable><Text style={styles.date}>Комментарии: {item.comments}</Text></View>
        <Pressable accessibilityRole="button" onPress={openProfile} style={styles.profileLink}><Text style={styles.link}>Перейти в профиль автора</Text><Ionicons name="chevron-forward" size={19} color={palette.olive} /></Pressable>
      </View>
      <Text style={styles.heading}>Комментарии</Text>
      {comments.map(value => <View key={value.id} style={styles.comment}><Text style={styles.author}>{value.authorName}</Text><Text style={styles.body}>{value.body}</Text></View>)}
      {!comments.length && <Text style={styles.date}>Пока нет комментариев</Text>}
      <TextInput accessibilityLabel="Комментарий" value={text} editable={!pendingComment} onChangeText={setText} multiline maxLength={1000} placeholder="Ваш комментарий" placeholderTextColor={palette.muted} style={styles.input} />
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || !text.trim()} onPress={() => void comment()} style={styles.submit}><Text style={styles.submitText}>{busy ? 'Отправляем...' : pendingComment ? 'Повторить отправку' : 'Отправить'}</Text></Pressable>
    </ScrollView>}
  </View>;
}
const baseStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream }, loading: { marginTop: 45 }, content: { padding: 18, paddingBottom: 145, gap: 15 },
  card: { position: 'relative', padding: 18, backgroundColor: palette.surface, borderRadius: 22, gap: 12 },
  title: { fontSize: 25, lineHeight: 34, fontWeight: '800', color: palette.forest }, heading: { fontSize: 21, lineHeight: 29, color: palette.forest, fontWeight: '700' },
  date: { fontSize: 13, lineHeight: 19, color: palette.muted }, body: { fontSize: 16, lineHeight: 24, color: palette.forest }, media: { width: '100%', height: 280, borderRadius: 14 },
  quote: { backgroundColor: palette.cream, borderRadius: 16, padding: 12, gap: 8 }, author: { fontSize: 14, color: palette.forest, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20 }, action: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 6 },
  profileLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderColor: palette.border }, link: { color: palette.olive, fontSize: 15, fontWeight: '700' },
  comment: { borderBottomWidth: 1, borderColor: palette.border, paddingVertical: 12, gap: 5 }, input: { minHeight: 80, padding: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, borderRadius: 14, color: palette.forest, textAlignVertical: 'top' },
  submit: { padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: palette.olive }, submitText: { color: palette.cream, fontWeight: '700' }, error: { color: '#A23524', fontSize: 14, lineHeight: 21 },
});
