import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from 'react-native';

import type { Post, WorkingHours } from '@/constants/content';
import { createCompanyPlace, getCompanyPlaces, updateCompanyPlace, type CompanyPlaceFields } from '@/lib/company-places';
import { placeCategories } from '@/lib/place-categories';
import { ApiError } from '@/lib/statistics';

const categories = [{ id: '', name: 'Без категории' }, ...placeCategories.filter(category => category.id !== 'all')];
const categoryNames = new Map<string, string>(categories.map(category => [category.id, category.name]));

type HoursRow = WorkingHours & { key: string };
type Draft = {
  id?: string;
  requestId: string;
  fields: Omit<CompanyPlaceFields, 'workingHours'>;
  hours: HoursRow[];
};

function makeKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function makeDraft(post?: Post): Draft {
  return {
    id: post?.id,
    requestId: makeKey(),
    fields: {
      place: post?.place ?? '',
      address: post?.address ?? '',
      bio: post?.bio ?? '',
      category: post?.category ?? '',
      image: post?.image?.startsWith('data:') ? undefined : post?.image,
    },
    hours: (post?.workingHours ?? []).map((slot, index) => ({ ...slot, key: `existing-${index}` })),
  };
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
        placeholderTextColor="#64748b"
        {...props}
        style={[styles.input, props.multiline && styles.multiline]}
      />
    </View>
  );
}

export default function ManagePlacesScreen() {
  const router = useRouter();
  const activeRequest = useRef<AbortController | null>(null);
  const [places, setPlaces] = useState<Post[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    setNotice('');
    void load(controller.signal);
    return () => controller.abort();
  }, [load]));

  const edit = (post?: Post) => {
    setNotice('');
    setError('');
    setDraft(makeDraft(post));
  };

  const updateField = (key: keyof Draft['fields'], value: string) => {
    setDraft(current => current && { ...current, fields: { ...current.fields, [key]: value } });
  };

  const updateHours = (key: string, field: keyof WorkingHours, text: string) => {
    setDraft(current => current && {
      ...current,
      hours: current.hours.map(slot => slot.key === key ? { ...slot, [field]: text } : slot),
    });
  };

  const save = async () => {
    if (!draft || saving || !draft.fields.place.trim()) return;

    const signal = activeRequest.current?.signal;
    setSaving(true);
    setError('');
    try {
      const fields = {
        ...draft.fields,
        workingHours: draft.hours.map(({ label, value }) => ({ label, value })),
      };
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
    <View style={styles.screen}>
      <Stack.Screen options={{
        title: draft ? (draft.id ? 'Редактирование заведения' : 'Новое заведение') : 'Мои заведения',
        headerBackTitle: 'Профиль',
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#0f172a',
        headerShadowVisible: false,
      }} />
      <ScrollView key={draft?.requestId ?? 'list'} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error && (!draft || needsLogin) ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {needsLogin && <Action title="Войти" onPress={() => router.push('/login')} />}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        {loading && <ActivityIndicator accessibilityLabel="Загрузка заведений" color="#2563eb" />}
        {!loading && !places && !needsLogin && <Action title="Повторить" onPress={() => void load(activeRequest.current?.signal)} secondary />}

        {places && !needsLogin && (draft ? (
          <View style={styles.card}>
            <Field label="Название заведения" value={draft.fields.place} maxLength={200} editable={!saving}
              onChangeText={text => updateField('place', text)} />
            <Field label="Адрес" value={draft.fields.address} maxLength={2000} editable={!saving}
              onChangeText={text => updateField('address', text)} />
            <Field label="Описание" value={draft.fields.bio} maxLength={2000} multiline editable={!saving}
              onChangeText={text => updateField('bio', text)} />
            <Field label="Ссылка на фото" placeholder="https://…" value={draft.fields.image ?? ''} maxLength={2048}
              autoCapitalize="none" keyboardType="url" editable={!saving} onChangeText={text => updateField('image', text)} />

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

            <View style={styles.hours}>
              <Text accessibilityRole="header" style={styles.title}>Часы работы</Text>
              {draft.hours.map((slot, index) => (
                <View key={slot.key} style={styles.hoursRow}>
                  <Field label="День или период" accessibilityLabel={`День или период ${index + 1}`} placeholder="Пн–Пт"
                    value={slot.label} maxLength={80} editable={!saving} onChangeText={text => updateHours(slot.key, 'label', text)} />
                  <Field label="Часы работы" accessibilityLabel={`Часы работы ${index + 1}`} placeholder="09:00–18:00"
                    value={slot.value} maxLength={100} editable={!saving} onChangeText={text => updateHours(slot.key, 'value', text)} />
                  <Action title="Удалить строку" secondary disabled={saving} onPress={() => {
                    setDraft(current => current && { ...current, hours: current.hours.filter(row => row.key !== slot.key) });
                  }} />
                </View>
              ))}
              <Action title="Добавить часы" secondary disabled={saving || draft.hours.length >= 30} onPress={() => {
                const key = makeKey();
                setDraft(current => current && { ...current, hours: [...current.hours, { key, label: '', value: '' }] });
              }} />
            </View>

            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Action title={saving ? 'Сохраняем…' : 'Сохранить'} disabled={saving || !draft.fields.place.trim()} onPress={() => void save()} />
              <Action title="Отмена" secondary disabled={saving} onPress={() => { setError(''); setDraft(null); }} />
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
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  card: { borderRadius: 24, backgroundColor: '#ffffff', padding: 20, gap: 14 },
  title: { color: '#0f172a', fontSize: 18, fontWeight: '700' },
  detail: { color: '#64748b', fontSize: 14 },
  notice: { color: '#166534', fontSize: 14 },
  error: { color: '#b42318', fontSize: 14 },
  field: { gap: 6 },
  label: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
  hours: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0', paddingTop: 14 },
  hoursRow: { gap: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  actionText: { color: '#ffffff', fontWeight: '700' },
  secondaryAction: { backgroundColor: '#dbeafe' },
  secondaryText: { color: '#1d4ed8' },
  disabled: { opacity: 0.55 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#f1f5f9' },
  chipText: { color: '#0f172a', fontWeight: '600' },
  selectedChip: { backgroundColor: '#2563eb' },
  selectedChipText: { color: '#ffffff' },
});
