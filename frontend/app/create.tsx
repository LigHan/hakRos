import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Post } from '@/constants/content';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { getCompanyPlaces } from '@/lib/company-places';
import { publishSocial, socialRequestId, type NewSocialItem } from '@/lib/social';
import { getUserSession, type UserSession } from '@/lib/user-session';

type Kind = 'post' | 'story';
export default function CreateScreen() {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = params.kind === 'story' ? 'story' : 'post';
  const [session, setSession] = useState<UserSession | null>(null);
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [places, setPlaces] = useState<Post[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [pending, setPending] = useState<NewSocialItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const draftKey = (id: string) => `@hakros/draft/${id}/${kind}`;
  const pendingKey = (id: string) => `@hakros/pending/${id}/${kind}`;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await getUserSession();
        if (!active) return;
        setSession(user);
        if (user) {
          const [draft, savedPending, companyPlaces] = await Promise.all([
            AsyncStorage.getItem(draftKey(user.id)), AsyncStorage.getItem(pendingKey(user.id)),
            user.role === 'company' ? getCompanyPlaces() : Promise.resolve([]),
          ]);
          if (!active) return;
          setText(draft ?? '');
          setPlaces(companyPlaces);
          if (companyPlaces.length) setPlaceId(companyPlaces[0].id);
          if (savedPending) {
            const payload: NewSocialItem = JSON.parse(savedPending);
            setPending(payload); setText(payload.body); setImageUrl(payload.imageUrl ?? ''); setPlaceId(payload.placeId ?? null);
          }
        }
      } catch { if (active) setError('Не удалось загрузить данные. Проверьте подключение и войдите снова.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  // keys depend only on kind and the current user, loaded above
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const saveDraft = async () => {
    if (!session || pending) return;
    try { await AsyncStorage.setItem(draftKey(session.id), text); setMessage('Черновик сохранён на этом устройстве.'); }
    catch { setError('Не удалось сохранить черновик.'); }
  };
  const publish = async () => {
    if (!session || saving) return;
    if (!pending && !text.trim() && !imageUrl.trim()) { setError('Добавьте текст или ссылку на изображение.'); return; }
    if (!pending && imageUrl.trim() && !/^https?:\/\//i.test(imageUrl.trim())) { setError('Ссылка на изображение должна начинаться с http:// или https://.'); return; }
    if (session.role === 'company' && !placeId) { setError('Сначала добавьте заведение в профиле.'); return; }
    setSaving(true); setError(''); setMessage('');
    const payload: NewSocialItem = pending ?? { kind, body: text.trim(), imageUrl: imageUrl.trim() || null, placeId: session.role === 'company' ? placeId : null, requestId: socialRequestId() };
    try {
      await AsyncStorage.setItem(pendingKey(session.id), JSON.stringify(payload));
      setPending(payload);
      await publishSocial(payload);
      await AsyncStorage.multiRemove([pendingKey(session.id), draftKey(session.id)]);
      setPending(null); setText(''); setImageUrl('');
      setMessage(kind === 'story' ? 'История опубликована на 24 часа.' : 'Публикация добавлена в ленту.');
    } catch { setError('Не удалось подтвердить публикацию. Повторите отправку — дубликата не будет.'); }
    finally { setSaving(false); }
  };

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Stack.Screen options={{ title: kind === 'post' ? 'Новая публикация' : 'Новая история', headerStyle: { backgroundColor: palette.cream }, headerTintColor: palette.forest }} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {loading ? <ActivityIndicator color={palette.olive} /> : !session ? <View style={styles.card}><Ionicons name="person-circle-outline" size={42} color={palette.olive} /><Text style={styles.title}>Сначала войдите</Text><Text style={styles.description}>Войдите, чтобы поделиться историей или публикацией.</Text><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/login', params: { returnTo: kind } })} style={styles.button}><Text style={styles.buttonText}>Войти</Text></Pressable></View> : <View style={styles.card}>
        <Text style={styles.eyebrow}>{kind === 'post' ? 'ПУБЛИКАЦИЯ' : 'ИСТОРИЯ'}</Text>
        <Text style={styles.title}>{kind === 'post' ? 'Чем хотите поделиться?' : 'Какой у вас момент?'}</Text>
        <Text style={styles.description}>{kind === 'story' ? 'Историю увидят друзья или подписчики заведения в течение 24 часов.' : 'Публикацию увидят друзья или подписчики выбранного заведения.'}</Text>
        {session.role === 'company' && <View><Text style={styles.description}>От имени заведения:</Text>{places.map(place => <Pressable key={place.id} disabled={!!pending} onPress={() => setPlaceId(place.id)} style={styles.choice}><Ionicons name={placeId === place.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={palette.olive}/><Text style={styles.choiceText}>{place.place}</Text></Pressable>)}{!places.length && <Text style={styles.error}>Сначала добавьте заведение в профиле.</Text>}</View>}
        <TextInput accessibilityLabel="Текст" editable={!pending} multiline maxLength={kind === 'story' ? 280 : 2000} placeholder="Напишите здесь..." placeholderTextColor={palette.muted} value={text} onChangeText={value => { setText(value); setMessage(''); }} style={styles.input} />
        <Text style={styles.counter}>{text.length} / {kind === 'story' ? 280 : 2000}</Text>
        <TextInput accessibilityLabel="Ссылка на изображение" editable={!pending} autoCapitalize="none" keyboardType="url" placeholder="Ссылка на изображение (необязательно)" placeholderTextColor={palette.muted} value={imageUrl} onChangeText={setImageUrl} style={styles.url} />
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}{!!message && <Text accessibilityRole="alert" style={styles.success}>{message}</Text>}
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void publish()} style={[styles.button, saving && styles.disabled]}><Text style={styles.buttonText}>{saving ? 'Отправляем...' : pending ? 'Повторить отправку' : 'Опубликовать'}</Text></Pressable>
        {!pending && <Pressable accessibilityRole="button" onPress={() => void saveDraft()} style={styles.secondary}><Text style={styles.secondaryText}>Сохранить черновик</Text></Pressable>}
      </View>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const baseStyles = StyleSheet.create({
  page:{flex:1,backgroundColor:palette.cream},content:{padding:20,paddingTop:34},card:{backgroundColor:palette.surface,borderRadius:24,borderColor:palette.border,borderWidth:1,padding:22,gap:12},eyebrow:{color:palette.terracotta,fontWeight:'700',fontSize:11,letterSpacing:1},title:{color:palette.forest,fontWeight:'800',fontSize:24},description:{color:palette.muted,lineHeight:21},input:{minHeight:150,borderWidth:1,borderColor:palette.border,borderRadius:16,padding:14,color:palette.forest,backgroundColor:palette.cream,textAlignVertical:'top'},url:{borderWidth:1,borderColor:palette.border,borderRadius:16,padding:14,color:palette.forest,backgroundColor:palette.cream},counter:{color:palette.muted,fontSize:12,textAlign:'right'},button:{backgroundColor:palette.olive,padding:14,borderRadius:16,alignItems:'center'},buttonText:{color:palette.cream,fontWeight:'700'},secondary:{padding:10,alignItems:'center'},secondaryText:{color:palette.olive,fontWeight:'700'},choice:{flexDirection:'row',gap:8,alignItems:'center',paddingVertical:7},choiceText:{color:palette.forest},disabled:{opacity:0.5},error:{color:'#A23524'},success:{color:palette.olive},
});
