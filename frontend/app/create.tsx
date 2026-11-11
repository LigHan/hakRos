import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SocialMedia } from '@/components/social-media';
import type { Post } from '@/constants/content';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { getCompanyPlaces } from '@/lib/company-places';
import { checkVideoAsset, uploadMedia, type UploadedMedia } from '@/lib/media';
import { publishSocial, socialRequestId, type NewSocialItem } from '@/lib/social';
import { getUserSession, type UserSession } from '@/lib/user-session';

type Kind = 'post' | 'story';
type SavedPending = { payload: NewSocialItem; media: UploadedMedia | null };
const messageFrom = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

export default function CreateScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = params.kind === 'story' ? 'story' : 'post';
  return <Composer key={kind} kind={kind} />;
}

function Composer({ kind }: { kind: Kind }) {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const storiesUnavailable = kind === 'story' && Platform.OS === 'web';
  const [session, setSession] = useState<UserSession | null>(null);
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [video, setVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploaded, setUploaded] = useState<UploadedMedia | null>(null);
  const [places, setPlaces] = useState<Post[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [pending, setPending] = useState<NewSocialItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const draftKey = (id: string) => `@hakros/draft/${id}/${kind}`;
  const pendingKey = (id: string) => `@hakros/pending/${id}/${kind}`;
  const busy = saving || picking;

  useEffect(() => {
    let active = true;
    if (storiesUnavailable) return () => { active = false; };
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
          setText(draft ?? ''); setPlaces(companyPlaces);
          if (companyPlaces.length) setPlaceId(companyPlaces[0].id);
          if (savedPending) {
            // Keep retry keys from older application versions.
            const restored: SavedPending | NewSocialItem = JSON.parse(savedPending);
            const payload = 'payload' in restored ? restored.payload : restored;
            setPending(payload); setText(payload.body); setImageUrl(payload.imageUrl ?? ''); setPlaceId(payload.placeId ?? null);
            if ('payload' in restored) setUploaded(restored.media);
          }
        }
      } catch { if (active) setError('Не удалось загрузить данные. Проверьте подключение и войдите снова.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
    // Keys depend on the kind and the current account loaded above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, storiesUnavailable]);

  const saveDraft = async () => {
    if (!session || pending || busy) return;
    try { await AsyncStorage.setItem(draftKey(session.id), text); setMessage(video ? 'Текстовый черновик сохранён на этом устройстве. Видео нужно будет выбрать повторно.' : 'Текстовый черновик сохранён на этом устройстве.'); }
    catch { setError('Не удалось сохранить черновик.'); }
  };
  const acceptVideo = (asset: ImagePicker.ImagePickerAsset) => {
    checkVideoAsset(asset, kind === 'story' ? 60 : undefined);
    setVideo(asset); setUploaded(null); setImageUrl(''); setMessage('Видео готово к отправке.');
  };
  const chooseVideo = async () => {
    if (busy || pending || storiesUnavailable) return;
    setPicking(true); setError(''); setMessage(''); setPermissionDenied(false);
    try {
      if (Platform.OS === 'ios') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { setPermissionDenied(true); throw new Error('Разрешите доступ к медиатеке в настройках устройства, чтобы прикрепить видео.'); }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: false, allowsMultipleSelection: false });
      if (result.canceled) { setMessage('Выбор видео отменён.'); return; }
      acceptVideo(result.assets[0]);
    } catch (cause) { setError(messageFrom(cause, 'Не удалось выбрать видео. Попробуйте ещё раз.')); }
    finally { setPicking(false); }
  };
  const recordVideo = async () => {
    if (Platform.OS === 'web' || busy || pending) return;
    setPicking(true); setError(''); setMessage(''); setPermissionDenied(false);
    try {
      const camera = await ImagePicker.requestCameraPermissionsAsync();
      if (!camera.granted) { setPermissionDenied(true); throw new Error('Разрешите доступ к камере в настройках устройства, чтобы записать видео.'); }
      if (Platform.OS === 'android') {
        const microphone = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (microphone !== PermissionsAndroid.RESULTS.GRANTED) { setPermissionDenied(true); throw new Error('Для записи видео со звуком разрешите доступ к микрофону.'); }
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], allowsEditing: false, videoMaxDuration: kind === 'story' ? 60 : 120, videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium });
      if (result.canceled) { setMessage('Запись отменена.'); return; }
      acceptVideo(result.assets[0]);
    } catch (cause) { setError(messageFrom(cause, 'Не удалось открыть камеру. Проверьте доступ к камере и микрофону.')); }
    finally { setPicking(false); }
  };
  const publish = async () => {
    if (!session || busy || storiesUnavailable) return;
    if (!pending && !text.trim() && !imageUrl.trim() && !video) { setError('Добавьте текст, видео или ссылку на изображение.'); return; }
    if (!pending && imageUrl.trim() && !/^https?:\/\//i.test(imageUrl.trim())) { setError('Ссылка на изображение должна начинаться с http:// или https://.'); return; }
    if (session.role === 'company' && !placeId) { setError('Сначала добавьте заведение в профиле.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      let media = uploaded;
      if (!pending && video && !media) {
        setUploading(true);
        try { media = await uploadMedia(video); setUploaded(media); }
        finally { setUploading(false); }
      }
      const payload: NewSocialItem = pending ?? { kind, body: text.trim(), imageUrl: imageUrl.trim() || null, mediaId: media?.id ?? null, placeId: session.role === 'company' ? placeId : null, requestId: socialRequestId() };
      await AsyncStorage.setItem(pendingKey(session.id), JSON.stringify({ payload, media } satisfies SavedPending));
      setPending(payload);
      await publishSocial(payload);
      await AsyncStorage.multiRemove([pendingKey(session.id), draftKey(session.id)]);
      setPending(null); setText(''); setImageUrl(''); setVideo(null); setUploaded(null);
      setMessage(kind === 'story' ? 'История опубликована на 24 часа.' : 'Публикация добавлена в ленту.');
    } catch (cause) { setError(messageFrom(cause, 'Не удалось подтвердить публикацию. Повторите отправку — дубликата не будет.')); }
    finally { setSaving(false); }
  };
  const preview = video?.uri || uploaded?.url;

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Stack.Screen options={{ title: kind === 'post' ? 'Новая публикация' : 'Новая история', headerStyle: { backgroundColor: palette.cream }, headerTintColor: palette.forest }} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]} keyboardShouldPersistTaps="handled">
      {storiesUnavailable ? <View style={styles.card}>
        <Ionicons name="phone-portrait-outline" size={42} color={palette.olive} />
        <Text style={styles.title}>Истории создаются с телефона</Text>
        <Text style={styles.description}>Откройте приложение на iPhone или Android, чтобы записать историю. На компьютере можно создать публикацию и прикрепить готовое видео.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/create', params: { kind: 'post' } })} style={styles.button}><Text style={styles.buttonText}>Создать публикацию</Text></Pressable>
      </View> : loading ? <ActivityIndicator color={palette.olive} /> : !session ? <View style={styles.card}>
        <Ionicons name="person-circle-outline" size={42} color={palette.olive} /><Text style={styles.title}>Сначала войдите</Text>
        <Text style={styles.description}>Войдите, чтобы поделиться историей или публикацией.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/login', params: { returnTo: kind } })} style={styles.button}><Text style={styles.buttonText}>Войти</Text></Pressable>
      </View> : <View style={styles.card}>
        <Text style={styles.eyebrow}>{kind === 'post' ? 'ПУБЛИКАЦИЯ' : 'ИСТОРИЯ'}</Text>
        <Text style={styles.title}>{kind === 'post' ? 'Чем хотите поделиться?' : 'Какой у вас момент?'}</Text>
        <Text style={styles.description}>{kind === 'story' ? 'Историю увидят друзья или подписчики заведения в течение 24 часов.' : 'Публикация появится в ленте с учётом приватности вашего профиля.'}</Text>
        {session.role === 'company' && <View><Text style={styles.description}>От имени заведения:</Text>{places.map(place => <Pressable key={place.id} disabled={!!pending || busy} onPress={() => setPlaceId(place.id)} style={styles.choice}><Ionicons name={placeId === place.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={palette.olive} /><Text style={styles.choiceText}>{place.place}</Text></Pressable>)}{!places.length && <Text style={styles.error}>Сначала добавьте заведение в профиле.</Text>}</View>}
        <TextInput accessibilityLabel="Текст" editable={!pending && !busy} multiline maxLength={kind === 'story' ? 280 : 2000} placeholder="Напишите здесь..." placeholderTextColor={palette.muted} value={text} onChangeText={value => { setText(value); setMessage(''); }} style={styles.input} />
        <Text style={styles.counter}>{text.length} / {kind === 'story' ? 280 : 2000}</Text>
        {!pending && <View style={styles.mediaActions}>
          {Platform.OS !== 'web' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void recordVideo()} style={[styles.mediaButton, busy && styles.disabled]}><Ionicons name="videocam-outline" color={palette.forest} size={23} /><Text style={styles.mediaButtonText}>Записать видео</Text></Pressable>}
          {kind === 'post' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void chooseVideo()} style={[styles.mediaButton, busy && styles.disabled]}><Ionicons name="attach-outline" color={palette.forest} size={23} /><Text style={styles.mediaButtonText}>Прикрепить видео</Text></Pressable>}
        </View>}
        {picking && <ActivityIndicator color={palette.olive} />}
        <Text style={styles.mediaHint}>{kind === 'story' ? 'Запись до 60 секунд, файл до 25 МБ.' : 'MP4, MOV или WebM до 25 МБ. Запись с камеры доступна в приложении на телефоне.'}</Text>
        {!!preview && <View style={styles.preview}>
          <SocialMedia uri={preview} kind="video" />
          {!pending && <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setVideo(null); setUploaded(null); }} style={styles.secondary}><Text style={styles.secondaryText}>Убрать видео</Text></Pressable>}
        </View>}
        {!video && !uploaded && <TextInput accessibilityLabel="Ссылка на изображение" editable={!pending && !busy} autoCapitalize="none" keyboardType="url" placeholder="Ссылка на изображение (необязательно)" placeholderTextColor={palette.muted} value={imageUrl} onChangeText={setImageUrl} style={styles.url} />}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {permissionDenied && Platform.OS !== 'web' && <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.secondary}><Text style={styles.secondaryText}>Открыть настройки устройства</Text></Pressable>}
        {!!message && <Text accessibilityRole="alert" style={styles.success}>{message}</Text>}
        {uploading && <View style={styles.uploadStatus}><ActivityIndicator color={palette.olive} /><Text style={styles.description}>Загружаем видео на сервер…</Text></View>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void publish()} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{uploading ? 'Загружаем видео...' : saving ? 'Отправляем...' : pending ? 'Повторить отправку' : 'Опубликовать'}</Text></Pressable>
        {!pending && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveDraft()} style={styles.secondary}><Text style={styles.secondaryText}>Сохранить текстовый черновик</Text></Pressable>}
      </View>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const baseStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.cream },
  content: { padding: 20, paddingTop: 28, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: { backgroundColor: palette.surface, borderRadius: 24, borderColor: palette.border, borderWidth: 1, padding: 20, gap: 12 },
  eyebrow: { color: palette.terracotta, fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  title: { color: palette.forest, fontWeight: '800', fontSize: 24 },
  description: { color: palette.muted, lineHeight: 21 },
  input: { minHeight: 150, borderWidth: 1, borderColor: palette.border, borderRadius: 16, padding: 14, color: palette.forest, backgroundColor: palette.cream, textAlignVertical: 'top' },
  url: { borderWidth: 1, borderColor: palette.border, borderRadius: 16, padding: 14, color: palette.forest, backgroundColor: palette.cream },
  counter: { color: palette.muted, fontSize: 12, textAlign: 'right' },
  button: { backgroundColor: palette.olive, padding: 14, borderRadius: 16, alignItems: 'center' },
  buttonText: { color: palette.cream, fontWeight: '700' },
  secondary: { padding: 10, alignItems: 'center' },
  secondaryText: { color: palette.olive, fontWeight: '700', textAlign: 'center' },
  choice: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 7 },
  choiceText: { color: palette.forest, flex: 1 },
  mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mediaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: palette.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, flexGrow: 1, flexShrink: 1 },
  mediaButtonText: { color: palette.forest, fontWeight: '600', flexShrink: 1 },
  mediaHint: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  preview: { gap: 4 },
  uploadStatus: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  error: { color: '#A23524', lineHeight: 21 },
  success: { color: palette.olive, lineHeight: 21 },
});
