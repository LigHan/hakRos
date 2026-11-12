import { KeyboardAwareScrollView as ScrollView } from '@/components/keyboard-aware-scroll-view';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat, type ImageManipulatorContext, type ImageRef } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { webData } from '@/lib/web-data';

import { CompanyPlaceAddress } from '@/components/company-place-address';
import { PlaceHoursEditor } from '@/components/place-hours-editor';
import type { WorkingHours } from '@/constants/content';
import { createCompanyPlace, getCompanyPlaces, updateCompanyPlace, type CompanyPlace, type CompanyPlaceFields } from '@/lib/company-places';
import { placeCategories } from '@/lib/place-categories';
import { ApiError } from '@/lib/statistics';

const categories = [{ id: '', name: 'Без категории' }, ...placeCategories.filter(category => category.id !== 'all')];
const categoryNames = new Map<string, string>(categories.map(category => [category.id, category.name]));

type Draft = {
  id?: string;
  requestId: string;
  fields: Omit<CompanyPlaceFields, 'workingHours'>;
  hours: WorkingHours[];
  photoUri?: string;
};

function makeKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function makeDraft(post?: CompanyPlace): Draft {
  return {
    id: post?.id,
    requestId: makeKey(),
    fields: {
      place: post?.place ?? '',
      address: post?.address ?? '',
      coordinates: post?.coordinates ?? null,
      bio: post?.bio ?? '',
      category: post?.category ?? '',
    },
    hours: post?.workingHours ?? [],
    photoUri: post?.image.startsWith('data:') ? undefined : post?.image,
  };
}

async function pickCover() {
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'] });
  if (result.canceled) return null;

  const { uri } = result.assets[0];
  let context: ImageManipulatorContext | undefined;
  let rendered: ImageRef | undefined;
  try {
    context = ImageManipulator.manipulate(uri, { maxWidth: 1280, maxHeight: 1280 });
    rendered = await context.renderAsync();
    const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
    if (Platform.OS === 'web') URL.revokeObjectURL(image.uri);
    if (!image.base64 || image.base64.length > Math.floor(1024 * 1024 / 3) * 4) {
      throw new Error('Не удалось подготовить фото размером до 1 МБ.');
    }
    return image.base64;
  } finally {
    rendered?.release();
    context?.release();
    if (Platform.OS === 'web') URL.revokeObjectURL(uri);
  }
}

function Action({ title, onPress, disabled = false, secondary = false }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, secondary && styles.secondaryAction, disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#6F7457"
        {...props}
        style={[styles.input, props.multiline && styles.multiline]}
      />
    </View>
  );
}

export default function ManagePlacesScreen() {
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const activeRequest = useRef<AbortController | null>(null);
  const [places, setPlaces] = useState<CompanyPlace[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeHours, setActiveHours] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notice, setNotice] = useState('');

  const reportError = useCallback((cause: unknown, fallback: string) => {
    const expired = cause instanceof ApiError && cause.status === 401;
    setNeedsLogin(expired);
    setError(expired ? 'Войдите в аккаунт компании, чтобы открыть кабинет.' : cause instanceof ApiError ? cause.message : fallback);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setNeedsLogin(false);
    setError('');
    try {
      const result = await getCompanyPlaces(signal);
      if (!signal?.aborted) setPlaces(result);
    } catch (cause) {
      if (!signal?.aborted) reportError(cause, 'Не удалось загрузить заведения.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [reportError]);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    setPlaces(null);
    setDraft(null);
    setSaving(false);
    setActiveHours(null);
    setPhotoBusy(false);
    setPhotoError('');
    setNotice('');
    void load(controller.signal);
    return () => controller.abort();
  }, [load]));

  const edit = (post?: CompanyPlace) => {
    setNotice('');
    setError('');
    setActiveHours(null);
    setPhotoError('');
    setDraft(makeDraft(post));
  };

  const updateField = (key: 'place' | 'bio' | 'category', value: string) => {
    setDraft(current => current && { ...current, fields: { ...current.fields, [key]: value } });
  };

  const updateHours = (hours: WorkingHours[]) => {
    setDraft(current => current && { ...current, hours });
    setActiveHours(null);
  };

  const choosePhoto = async () => {
    if (!draft || saving || photoBusy) return;
    const signal = activeRequest.current?.signal;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const coverBase64 = await pickCover();
      if (!coverBase64 || signal?.aborted) return;
      setDraft(current => current?.requestId === draft.requestId ? {
        ...current,
        photoUri: 'data:image/jpeg;base64,' + coverBase64,
        fields: { ...current.fields, image: undefined, coverBase64 },
      } : current);
    } catch {
      if (!signal?.aborted) setPhotoError('Не удалось открыть фото. Попробуйте выбрать другой файл.');
    } finally {
      if (!signal?.aborted) setPhotoBusy(false);
    }
  };

  const removePhoto = () => {
    setPhotoError('');
    setDraft(current => current && {
      ...current,
      photoUri: undefined,
      fields: { ...current.fields, image: '', coverBase64: undefined },
    });
  };

  const save = async () => {
    if (!draft || saving || photoBusy || activeHours !== null || !draft.fields.place.trim()) return;

    const signal = activeRequest.current?.signal;
    setSaving(true);
    setError('');
    try {
      const fields = { ...draft.fields, workingHours: draft.hours };
      const saved = draft.id
        ? await updateCompanyPlace(draft.id, fields, signal)
        : await createCompanyPlace(fields, draft.requestId, signal);
      if (signal?.aborted) return;
      setPlaces(current => [saved, ...(current ?? []).filter(post => post.id !== saved.id)]);
      setDraft(null);
      setNotice('Карточка сохранена.');
    } catch (cause) {
      if (!signal?.aborted) reportError(cause, 'Не удалось сохранить карточку. Попробуйте ещё раз.');
    } finally {
      if (!signal?.aborted) setSaving(false);
    }
  };

  return (
    <View {...webData({ hakrosFocus: 'company' })} style={styles.screen}>
      <Stack.Screen options={{
        title: draft ? (draft.id ? 'Редактирование заведения' : 'Новое заведение') : 'Мои заведения',
        headerBackTitle: 'Профиль',
        headerStyle: { backgroundColor: '#FEFAE0' },
        headerTintColor: '#283618',
        headerShadowVisible: false,
      }} />
      <ScrollView key={draft?.requestId ?? 'list'} contentContainerStyle={[styles.content, { paddingBottom: 100 + bottom }]}
        keyboardShouldPersistTaps="handled">
        {error && (!draft || needsLogin) ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {needsLogin && <Action title="Войти" onPress={() => router.push('/login')} />}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        {loading && <ActivityIndicator accessibilityLabel="Загрузка заведений" color="#606C38" />}
        {!loading && !places && !needsLogin && <Action title="Повторить" onPress={() => void load(activeRequest.current?.signal)} secondary />}

        {places && !needsLogin && (draft ? (
          <View style={styles.card}>
            <Field label="Название заведения" value={draft.fields.place} maxLength={200} editable={!saving}
              onChangeText={text => updateField('place', text)} />
            <CompanyPlaceAddress address={draft.fields.address} coordinates={draft.fields.coordinates ?? null} disabled={saving}
              onChange={value => setDraft(current => current && { ...current, fields: { ...current.fields, ...value } })} />
            <Field label="Описание" value={draft.fields.bio} maxLength={2000} multiline editable={!saving}
              onChangeText={text => updateField('bio', text)} />
            <View style={styles.field}>
              <Text style={styles.label}>Фото заведения</Text>
              {draft.photoUri && (
                <Image
                  source={{ uri: draft.photoUri }}
                  accessibilityLabel="Предпросмотр фото заведения"
                  contentFit="cover"
                  style={styles.photo}
                />
              )}
              <View style={styles.actions}>
                <Action title={photoBusy ? 'Подготавливаем фото…' : draft.photoUri ? 'Заменить фото' : 'Выбрать фото'}
                  secondary disabled={saving || photoBusy} onPress={() => void choosePhoto()} />
                {draft.photoUri && <Action title="Убрать фото" secondary disabled={saving || photoBusy} onPress={removePhoto} />}
              </View>
              {photoError ? <Text accessibilityRole="alert" style={styles.error}>{photoError}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Категория</Text>
              <View style={styles.actions}>
                {categories.map(category => {
                  const selected = category.id === draft.fields.category;
                  return (
                    <TouchableOpacity
                      key={category.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.chip, selected && styles.selectedChip]}
                      disabled={saving}
                      onPress={() => updateField('category', category.id)}
                    >
                      <Text style={[styles.chipText, selected && styles.selectedChipText]}>{category.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!categoryNames.has(draft.fields.category) && <Text style={styles.detail}>{draft.fields.category}</Text>}
            </View>

            <PlaceHoursEditor rows={draft.hours} activeIndex={activeHours} disabled={saving}
              onEdit={setActiveHours} onChange={updateHours} />

            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Action title={saving ? 'Сохраняем…' : 'Сохранить'}
                disabled={saving || photoBusy || activeHours !== null || !draft.fields.place.trim()} onPress={() => void save()} />
              <Action title="Отмена" secondary disabled={saving || photoBusy} onPress={() => { setError(''); setDraft(null); }} />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              {places.length === 0 && <Text style={styles.detail}>У компании пока нет заведений.</Text>}
              <Action title="Добавить заведение" onPress={() => edit()} />
            </View>
            {places.map(post => (
              <View key={post.id} style={styles.card}>
                <Text accessibilityRole="header" style={styles.title}>{post.place}</Text>
                {post.address ? <Text style={styles.detail}>{post.address}</Text> : null}
                {post.category ? <Text style={styles.detail}>{categoryNames.get(post.category) ?? post.category}</Text> : null}
                <View style={styles.actions}>
                  <Action title="Редактировать" onPress={() => edit(post)} />
                  <Action title="Открыть карточку" secondary onPress={() => router.push({
                    pathname: '/company/[id]', params: { id: post.id },
                  })} />
                </View>
              </View>
            ))}
          </>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFCED' },
  content: { padding: 20, gap: 16 },
  card: { borderRadius: 24, backgroundColor: '#FFFCED', padding: 20, gap: 14 },
  title: { color: '#283618', fontSize: 18, fontWeight: '700' },
  detail: { color: '#6F7457', fontSize: 14 },
  notice: { color: '#166534', fontSize: 14 },
  error: { color: '#b42318', fontSize: 14 },
  field: { gap: 6 },
  label: { color: '#283618', fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#D9D6B5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#283618',
    backgroundColor: '#FFFCED',
  },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
  photo: { width: '100%', height: 160, borderRadius: 12, backgroundColor: '#FFFCED' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#606C38',
  },
  actionText: { color: '#ffffff', fontWeight: '700' },
  secondaryAction: { backgroundColor: '#F0ECD1' },
  secondaryText: { color: '#283618' },
  disabled: { opacity: 0.55 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#FFFCED' },
  chipText: { color: '#283618', fontWeight: '600' },
  selectedChip: { backgroundColor: '#606C38' },
  selectedChipText: { color: '#ffffff' },
});
