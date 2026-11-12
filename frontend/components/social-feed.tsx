import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SketchFrame } from '@/components/sketch-frame';
import { SocialMedia } from '@/components/social-media';
import type { Story } from '@/constants/content';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { addSocialComment, getSocialComments, getSocialFeed, getSocialItem, publishSocial, setSocialLike, socialRequestId, type SocialComment, type SocialItem } from '@/lib/social';
import { getUserSession, type UserSession } from '@/lib/user-session';
import { ApiError } from '@/lib/statistics';
import { usePostPreview } from '@/lib/web-post-preview';

type StoryEntry = { id: string; authorKey: string; name: string; text: string; image: string | null; mediaKind: 'image' | 'video'; avatar: string | null; placeId: string | null };
export function SocialFeed({ legacyStories, legacyError }: { legacyStories: Story[]; legacyError: boolean }) {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const preview = usePostPreview();
  const [session, setSession] = useState<UserSession | null>(null);
  const [items, setItems] = useState<SocialItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'auth'>('loading');
  const [storyGroup, setStoryGroup] = useState<StoryEntry[] | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [commentItem, setCommentItem] = useState<SocialItem | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentRequest, setCommentRequest] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const identity = useRef<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const current = await getUserSession(); setSession(current);
      const nextIdentity = current?.id ?? null;
      if (identity.current !== nextIdentity) {
        setItems([]); setStatus('loading'); setStoryGroup(null);
        identity.current = nextIdentity;
      }
      const nextItems = current && current.role !== 'admin' ? await getSocialFeed() : [];
      // A response started before logout must not restore another account's feed.
      const latest = await getUserSession();
      if ((latest?.id ?? null) !== nextIdentity) {
        setSession(latest); setItems([]); setStoryGroup(null);
        identity.current = latest?.id ?? null;
        setStatus('ready'); return;
      }
      setItems(nextItems);
      setStatus('ready');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { setItems([]); setStatus('auth'); }
      else setStatus('error');
    } finally { inFlight.current = false; }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    if (!preview.revision) return;
    let active = true;
    Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load, preview.revision]);
  const groups = useMemo(() => {
    const stories: StoryEntry[] = [
      ...items.filter(item => item.kind === 'story').map(item => ({ id: item.id, authorKey: item.placeId ? `place:${item.placeId}` : `user:${item.authorId}`, name: item.placeName || item.authorName, text: item.body, image: item.mediaUrl || item.imageUrl, mediaKind: item.mediaKind || 'image' as const, avatar: item.authorAvatar ?? null, placeId: item.placeId })),
      ...legacyStories.map(story => ({ id: story.id, authorKey: `place:${story.postId}`, name: story.userName, text: story.text, image: story.image, mediaKind: 'image' as const, avatar: story.avatar, placeId: story.postId })),
    ];
    const result = new Map<string, StoryEntry[]>();
    for (const story of stories) result.set(story.authorKey, [...(result.get(story.authorKey) ?? []), story]);
    return [...result.values()];
  }, [items, legacyStories]);
  const posts = items.filter(item => item.kind === 'post');
  const activeStory = storyGroup?.[storyIndex];
  const openPost = (item: SocialItem) => {
    if (!preview.open({ type: 'social', id: item.id })) router.push({ pathname: '/post/[id]', params: { id: item.id } });
  };
  const openProfile = (item: SocialItem) => item.placeId
    ? router.push({ pathname: '/company/[id]', params: { id: item.placeId } })
    : router.push({ pathname: '/profile/[id]', params: { id: item.authorId } });
  const mediaPreview = (item: SocialItem, uri: string, kind: 'image' | 'video') => <Pressable accessibilityRole="button" accessibilityLabel={kind === 'video' ? 'Открыть видео публикации' : 'Открыть изображение публикации'} onPress={() => openPost(item)}>
    {kind === 'video' ? <View style={styles.videoPreview}><Ionicons name="play-circle-outline" size={52} color={palette.cream} /><Text style={styles.videoLabel}>Смотреть видео</Text></View> : <SocialMedia uri={uri} kind="image" style={styles.postImage} onRetry={() => void load()} />}
  </Pressable>;
  const refreshStory = async () => {
    if (!activeStory) return;
    try {
      const updated = await getSocialItem(activeStory.id);
      setStoryGroup(current => current?.map(story => story.id === updated.id ? { ...story, image: updated.mediaUrl || updated.imageUrl, mediaKind: updated.mediaKind || 'image' } : story) ?? null);
    } catch { setStoryGroup(null); void load(); }
  };
  const like = async (item: SocialItem) => {
    if (busy) return; setBusy(true); setMessage('');
    try { const updated = await setSocialLike(item.id, !item.liked); setItems(current => current.map(value => value.id === item.id ? updated : value)); if (preview.selected?.type === 'social' && preview.selected.id === item.id) preview.refresh(); }
    catch { setMessage('Не удалось изменить отметку. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  };
  const openComments = async (item: SocialItem) => {
    setCommentItem(item); setComments([]); setCommentText(''); setCommentRequest(null); setMessage(''); setBusy(true);
    try { setComments(await getSocialComments(item.id)); }
    catch { setMessage('Не удалось загрузить комментарии.'); }
    finally { setBusy(false); }
  };
  const comment = async () => {
    if (!commentItem || !commentText.trim() || busy) return;
    setBusy(true); setMessage(''); const requestId = commentRequest ?? socialRequestId(); setCommentRequest(requestId);
    try {
      await addSocialComment(commentItem.id, commentText.trim(), requestId);
      setComments(await getSocialComments(commentItem.id));
      setCommentText(''); setCommentRequest(null);
      setItems(current => current.map(item => item.id === commentItem.id ? { ...item, comments: item.comments + 1 } : item));
      if (preview.selected?.type === 'social' && preview.selected.id === commentItem.id) preview.refresh();
    } catch { setMessage('Не удалось отправить комментарий. Повторите отправку.'); }
    finally { setBusy(false); }
  };
  const repost = async (item: SocialItem) => {
    if (!session || busy) return; setBusy(true); setMessage('');
    const key = `@hakros/repost/${session.id}/${item.id}`;
    try {
      const requestId = await AsyncStorage.getItem(key) ?? socialRequestId();
      await AsyncStorage.setItem(key, requestId);
      await publishSocial({ kind:'post', body:'', originalId:item.id, requestId });
      await AsyncStorage.removeItem(key);
      setMessage('Репост добавлен. Его увидят только те, кому доступен оригинал.');
      setItems(await getSocialFeed());
    } catch { setMessage('Не удалось подтвердить репост. Повторите отправку.'); }
    finally { setBusy(false); }
  };
  return <View>
    <View style={styles.sectionHeading}><Text style={styles.heading}>Истории</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyList}>
      <Pressable accessibilityRole="button" accessibilityLabel={Platform.OS === 'web' ? 'Истории создаются на телефоне' : 'Моя история'} disabled={Platform.OS === 'web'} accessibilityState={{ disabled: Platform.OS === 'web' }} onPress={() => router.push({ pathname:'/create',params:{kind:'story'} })} style={[styles.storyItem, Platform.OS === 'web' && styles.disabled]}><View style={styles.myStory}><Ionicons name={Platform.OS === 'web' ? 'phone-portrait-outline' : 'add'} size={26} color={palette.forest}/></View><Text style={styles.storyName}>{Platform.OS === 'web' ? 'С телефона' : 'Моя история'}</Text></Pressable>
      {groups.map(group => <Pressable accessibilityRole="button" accessibilityLabel={`Истории ${group[0].name}`} key={group[0].authorKey} onPress={() => {setStoryGroup(group); setStoryIndex(0);}} style={styles.storyItem}><View style={styles.ring}>{group[0].avatar ? <Image source={{uri:group[0].avatar}} style={styles.avatar}/> : <Image source={require('@/assets/images/mascot-sketch.png')} style={styles.avatar} resizeMode="contain" />}</View><Text numberOfLines={1} style={styles.storyName}>{group[0].name}</Text></Pressable>)}
    </ScrollView>
    {!groups.length && status === 'ready' && !legacyError && <Text style={styles.hint}>{session ? 'Истории друзей и заведений из подписок появятся здесь' : 'Войдите, чтобы видеть истории друзей и подписок'}</Text>}
    {status === 'auth' ? <Pressable onPress={() => router.push('/login')} accessibilityRole="button"><Text style={styles.error}>Сессия закончилась. Нажмите, чтобы войти снова.</Text></Pressable> : (status === 'error' || legacyError) && <Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.error}>Не удалось загрузить истории или публикации. Нажмите, чтобы повторить.</Text></Pressable>}
    {status === 'loading' && <ActivityIndicator color={palette.olive} />}
    {session && <View style={styles.postsSection}>
      <Text style={styles.heading}>Друзья и подписки</Text>
      {!posts.length && status === 'ready' && <Text style={styles.hint}>Здесь появятся публикации друзей и заведений, на которые вы подписаны.</Text>}
      {posts.map(item => <View key={item.id} style={styles.post}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Профиль ${item.placeName || item.authorName}`} onPress={() => openProfile(item)}><Text style={styles.author}>{item.placeName || item.authorName}</Text></Pressable>
        <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString('ru-RU')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Открыть публикацию ${item.placeName || item.authorName}`} onPress={() => openPost(item)} style={styles.postContent}>
        {!!item.body && <Text style={styles.body}>{item.body}</Text>}
        {!!item.originalId && <View style={styles.quote}><Text style={styles.author}>{item.originalAuthorName}</Text><Text style={styles.body}>{item.originalBody}</Text></View>}
        </Pressable>
        {(item.originalMediaUrl || item.originalImageUrl) && mediaPreview(item, (item.originalMediaUrl || item.originalImageUrl)!, item.originalMediaKind || 'image')}
        {(item.mediaUrl || item.imageUrl) && mediaPreview(item, (item.mediaUrl || item.imageUrl)!, item.mediaKind || 'image')}
        <Pressable accessibilityRole="button" onPress={() => openPost(item)}><Text style={styles.link}>Открыть публикацию</Text></Pressable>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.liked ? 'Убрать лайк' : 'Нравится'} disabled={busy} onPress={() => void like(item)} style={styles.action}><Ionicons name={item.liked ? 'heart' : 'heart-outline'} color={palette.terracotta} size={22}/><Text style={styles.actionText}>{item.likes}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Комментарии" onPress={() => void openComments(item)} style={styles.action}><Ionicons name="chatbubble-outline" color={palette.forest} size={20}/><Text style={styles.actionText}>{item.comments}</Text></Pressable>
          {!item.originalId && session.role === 'user' && <Pressable accessibilityRole="button" accessibilityLabel="Репост" disabled={busy} onPress={() => void repost(item)} style={styles.action}><Ionicons name="repeat-outline" color={palette.forest} size={23}/><Text style={styles.actionText}>Репост</Text></Pressable>}
        </View><SketchFrame />
        {preview.selected?.type === 'social' && preview.selected.id === item.id && <View pointerEvents="none" style={styles.selectedShade} />}
      </View>)}
      {!!message && !commentItem && <Text accessibilityRole="alert" style={styles.hint}>{message}</Text>}
    </View>}
    <Modal visible={!!activeStory} transparent animationType="fade" onRequestClose={() => setStoryGroup(null)}><View style={styles.overlay}><View style={styles.modal}>
      {activeStory && <><Text style={styles.heading}>{activeStory.name} · {storyIndex+1}/{storyGroup?.length}</Text>{!!activeStory.image && <SocialMedia key={activeStory.id} uri={activeStory.image} kind={activeStory.mediaKind} active={!!activeStory} style={styles.storyImage} onRetry={() => void refreshStory()}/>}<Text style={styles.body}>{activeStory.text}</Text><View style={styles.actions}>{storyIndex > 0 && <Pressable onPress={() => setStoryIndex(storyIndex-1)}><Text style={styles.link}>Назад</Text></Pressable>}{storyGroup && storyIndex+1 < storyGroup.length && <Pressable onPress={() => setStoryIndex(storyIndex+1)}><Text style={styles.link}>Следующая</Text></Pressable>}{activeStory.placeId && <Pressable onPress={() => {const id=activeStory.placeId; setStoryGroup(null); if(id) router.push({pathname:'/company/[id]',params:{id}});}}><Text style={styles.link}>Открыть место</Text></Pressable>}</View></>}
      <Pressable onPress={() => setStoryGroup(null)} style={styles.close}><Text style={styles.link}>Закрыть</Text></Pressable>
    </View></View></Modal>
    <Modal visible={!!commentItem} transparent animationType="slide" onRequestClose={() => setCommentItem(null)}><View style={styles.overlay}><View style={styles.modal}>
      <Text style={styles.heading}>Комментарии</Text><ScrollView style={styles.commentList} keyboardShouldPersistTaps="handled">{comments.map(value => <View key={value.id} style={styles.comment}><Text style={styles.author}>{value.authorName}</Text><Text style={styles.body}>{value.body}</Text></View>)}{!comments.length && !busy && <Text style={styles.hint}>Комментариев пока нет</Text>}</ScrollView>
      <TextInput value={commentText} editable={!commentRequest} onChangeText={setCommentText} placeholder="Ваш комментарий" placeholderTextColor={palette.muted} maxLength={1000} multiline style={styles.input}/>{!!message && <Text style={styles.error}>{message}</Text>}
      <Pressable disabled={busy} onPress={() => void comment()} style={styles.submit}><Text style={styles.submitText}>{commentRequest ? 'Повторить отправку' : 'Отправить'}</Text></Pressable><Pressable onPress={() => {setCommentItem(null);setMessage('');}} style={styles.close}><Text style={styles.link}>Закрыть</Text></Pressable>
    </View></View></Modal>
  </View>;
}
const baseStyles=StyleSheet.create({
  selectedShade:{...StyleSheet.absoluteFill,borderRadius:20,backgroundColor:'rgba(20, 25, 14, 0.16)'},
  postContent:{gap:9},disabled:{opacity:0.55},videoPreview:{width:'100%',height:180,borderRadius:14,backgroundColor:palette.forest,alignItems:'center',justifyContent:'center',gap:10},videoLabel:{color:palette.cream,fontSize:15,fontWeight:'700'},
  sectionHeading:{paddingTop:18,paddingBottom:10},heading:{color:palette.forest,fontSize:17,fontWeight:'700'},storyList:{gap:13},storyItem:{width:70,alignItems:'center',gap:6},myStory:{width:62,height:62,borderRadius:31,alignItems:'center',justifyContent:'center',backgroundColor:'#E9E8C6'},ring:{width:62,height:62,borderRadius:31,borderWidth:2,borderColor:palette.terracotta,padding:3,alignItems:'center',justifyContent:'center',backgroundColor:palette.surface},avatar:{width:'100%',height:'100%',borderRadius:28},initial:{color:palette.olive,fontSize:24,fontWeight:'700'},storyName:{color:palette.forest,fontSize:11,textAlign:'center'},hint:{color:palette.muted,fontSize:12,lineHeight:18,marginTop:8},error:{color:'#A23524',fontSize:13,lineHeight:18,marginTop:8},postsSection:{gap:12,marginTop:20},post:{backgroundColor:palette.surface,borderRadius:20,padding:16,gap:7,position:'relative'},author:{fontSize:14,fontWeight:'700',color:palette.forest},date:{fontSize:11,color:palette.muted},body:{fontSize:15,lineHeight:22,color:palette.forest},postImage:{width:'100%',height:220,borderRadius:14},quote:{padding:12,borderRadius:12,backgroundColor:palette.cream,gap:4},actions:{flexDirection:'row',alignItems:'center',gap:20,flexWrap:'wrap',paddingTop:6},action:{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:6},actionText:{color:palette.forest,fontSize:13},overlay:{flex:1,backgroundColor:'rgba(20,29,12,0.7)',justifyContent:'center',padding:20},modal:{backgroundColor:palette.cream,borderRadius:24,padding:20,gap:12,width:'100%',maxWidth:400,maxHeight:'85%',alignSelf:'center'},storyImage:{width:'100%',height:260,borderRadius:12},link:{color:palette.olive,fontWeight:'700'},close:{alignItems:'center',padding:8},commentList:{maxHeight:260},comment:{gap:4,paddingVertical:8,borderBottomWidth:1,borderColor:palette.border},input:{backgroundColor:palette.surface,borderColor:palette.border,borderWidth:1,borderRadius:12,padding:12,color:palette.forest,minHeight:48},submit:{backgroundColor:palette.olive,borderRadius:14,padding:12,alignItems:'center'},submitText:{color:palette.cream,fontWeight:'700'},
});
