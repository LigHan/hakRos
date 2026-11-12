import { useAppStyles } from '@/lib/app-appearance';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getPlaceSubscription, setPlaceSubscription } from '@/lib/connections';
import { ApiError } from '@/lib/statistics';

type State = 'loading' | 'subscribed' | 'unsubscribed' | 'sign-in' | 'unavailable' | 'retry';

function failureState(error: unknown): State {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'sign-in';
    if (error.status === 403) return 'unavailable';
  }
  return 'retry';
}

export function PlaceSubscriptionButton({ placeId, onChanged }: { placeId: string; onChanged?: () => void }) {
  const styles = useAppStyles(baseStyles);
  const router = useRouter();
  const [state, setState] = useState<State>('loading');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setState('loading');
    setMessage('');
    try {
      const { subscribed } = await getPlaceSubscription(placeId, signal);
      if (!signal?.aborted) setState(subscribed ? 'subscribed' : 'unsubscribed');
    } catch (error) {
      if (signal?.aborted) return;
      const next = failureState(error);
      setState(next);
      if (next === 'retry') setMessage('Не удалось проверить подписку.');
    }
  }, [placeId]);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]));

  if (state === 'loading' || state === 'unavailable') return null;
  const subscribed = state === 'subscribed';
  const labels = {
    subscribed: 'Отписаться',
    unsubscribed: 'Подписаться',
    'sign-in': 'Войти, чтобы подписаться',
    retry: 'Повторить',
  };

  const onPress = async () => {
    if (state === 'sign-in') {
      router.push('/login');
      return;
    }
    if (state === 'retry') {
      await load();
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const result = await setPlaceSubscription(placeId, !subscribed);
      setState(result.subscribed ? 'subscribed' : 'unsubscribed');
      onChanged?.();
    } catch (error) {
      const next = failureState(error);
      if (next === 'retry') setMessage(error instanceof ApiError ? error.message : 'Не удалось изменить подписку.');
      else setState(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={labels[state]}
        accessibilityState={{ selected: subscribed, disabled: saving, busy: saving }}
        disabled={saving}
        onPress={() => void onPress()}
        style={[styles.button, subscribed && styles.selected, saving && styles.disabled]}
      >
        <Ionicons name={subscribed ? 'checkmark' : 'add'} size={18} color={subscribed ? '#283618' : '#fff'} />
        <Text style={[styles.label, subscribed && styles.selectedLabel]}>
          {saving ? 'Сохраняем…' : labels[state]}
        </Text>
      </TouchableOpacity>
      {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { alignSelf: 'flex-start', gap: 6, marginTop: 12 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#606C38',
  },
  selected: { backgroundColor: '#F0ECCD' },
  disabled: { opacity: 0.65 },
  label: { color: '#fff', fontSize: 14, fontWeight: '700' },
  selectedLabel: { color: '#283618' },
  error: { color: '#b42318', fontSize: 13 },
});
