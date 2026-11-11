import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { MapCoordinates } from '@/components/MapCanvas.types';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { getConnections, type Person } from '@/lib/connections';
import { api, ApiError } from '@/lib/statistics';

const path = '/api/map/location';
type Phase = 'off' | 'starting' | 'on' | 'stopping';
type SharingRun = { id?: string; timer?: ReturnType<typeof setTimeout>; published: boolean };

async function send<T>(token: string, method: 'POST' | 'PUT' | 'DELETE', url: string, body?: object): Promise<T> {
  const request = new AbortController();
  const timeout = setTimeout(() => request.abort(), 10_000);
  try {
    return await api(url, {
      method,
      signal: request.signal,
      keepalive: method === 'DELETE' && Platform.OS === 'web',
      headers: { Authorization: 'Bearer ' + token },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readPosition(): Promise<MapCoordinates> {
  const options = {
    accuracy: Location.Accuracy.Balanced,
    ...(Platform.OS === 'web' ? { maximumAge: 0, timeout: 12_000 } : {}),
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync(options),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Геопозиция недоступна.')), 15_000);
      }),
    ]);
    if (!Number.isFinite(position.timestamp) || Date.now() - position.timestamp > 60_000) {
      throw new Error('Свежая геопозиция недоступна.');
    }
    return {
      latitude: Number(position.coords.latitude.toFixed(3)),
      longitude: Number(position.coords.longitude.toFixed(3)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function MapLocationSharing({ token, onError, onOpenFriends }: {
  token: string;
  onError: (message: string) => void;
  onOpenFriends: () => void;
}) {
  const styles = useAppStyles(baseStyles);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('off');
  const [friends, setFriends] = useState<Person[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [issue, setIssue] = useState('');
  const [loading, setLoading] = useState(false);
  const current = useRef<SharingRun | null>(null);
  const pickerRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const stop = useCallback(async (showStatus: boolean) => {
    const run = current.current;
    if (!run) return;
    current.current = null;
    clearTimeout(run.timer);
    if (showStatus) setPhase(run.id ? 'stopping' : 'off');
    if (!run.id) return;
    try {
      await send(token, 'DELETE', path + '/' + run.id);
    } catch {
      if (showStatus && mounted.current) {
        onError('Обновление остановлено. Сервер не подтвердил отключение, отметка исчезнет через пять минут без обновлений.');
      }
    } finally {
      if (showStatus && mounted.current) setPhase('off');
    }
  }, [token, onError]);

  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'background') {
        pickerRequest.current?.abort();
        setOpen(false);
        void stop(true);
      }
    });
    return () => {
      mounted.current = false;
      listener.remove();
      pickerRequest.current?.abort();
      void stop(false);
    };
  }, [stop]);

  const loadFriends = async () => {
    pickerRequest.current?.abort();
    const request = new AbortController();
    pickerRequest.current = request;
    setLoading(true);
    setIssue('');
    setFriends(null);
    try {
      const data = await getConnections(request.signal);
      if (!request.signal.aborted) {
        setFriends(data.friends);
        setSelected(ids => ids.filter(id => data.friends.some(friend => friend.id === id)));
      }
    } catch (error) {
      if (!request.signal.aborted) setIssue(error instanceof ApiError ? error.message : 'Не удалось загрузить друзей.');
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  };

  const close = () => {
    pickerRequest.current?.abort();
    setOpen(false);
    void stop(true);
  };

  const start = async () => {
    if (phase !== 'off' || current.current || selected.length === 0) return;
    const run: SharingRun = { published: false };
    current.current = run;
    setIssue('');
    setPhase('starting');

    const isCurrent = () => current.current === run;
    const fail = (message: string) => {
      if (!isCurrent()) return;
      if (run.published) onError(message);
      else setIssue(message);
      void stop(true);
    };
    const refresh = async () => {
      try {
        const position = await readPosition();
        if (!isCurrent()) return;
        if (!run.id) {
          const { id } = await send<{ id: string }>(token, 'POST', path, { recipientIds: selected });
          if (!isCurrent()) {
            void send(token, 'DELETE', path + '/' + id).catch(() => {});
            return;
          }
          run.id = id;
        }
        await send(token, 'PUT', path + '/' + run.id, position);
        if (!isCurrent()) return;
        if (!run.published) {
          run.published = true;
          setOpen(false);
          setPhase('on');
        }
        run.timer = setTimeout(() => void refresh(), 30_000);
      } catch (error) {
        fail(error instanceof ApiError ? error.message : 'Не удалось обновить геопозицию.');
      }
    };

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!isCurrent()) return;
      if (permission.status !== 'granted') {
        fail('Разрешите доступ к геопозиции в настройках устройства или браузера.');
        return;
      }
      void refresh();
    } catch {
      fail('Не удалось получить доступ к геопозиции.');
    }
  };

  return (
    <>
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={phase === 'on' ? 'Скрыть геопозицию' : 'Поделиться геопозицией'}
        disabled={phase === 'starting' || phase === 'stopping'}
        style={[styles.trigger, phase === 'on' && styles.activeTrigger]}
        onPress={() => {
          if (phase === 'on') {
            void stop(true);
            return;
          }
          setSelected([]);
          setOpen(true);
          void loadFriends();
        }}
      >
        <Ionicons name={phase === 'on' ? 'eye-off-outline' : 'share-social-outline'} size={16}
          color={phase === 'on' ? palette.cream : palette.olive} />
        <Text style={[styles.triggerText, phase === 'on' && styles.activeText]}>
          {phase === 'on' ? 'Скрыть' : phase === 'stopping' ? 'Отключаем…' : 'Поделиться'}
        </Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.dialogCard} accessibilityViewIsModal>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>Поделиться геопозицией</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Закрыть выбор друзей" onPress={close} style={styles.close}>
                <Ionicons name="close" size={23} color={palette.forest} />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Выберите, кто увидит ваше примерное положение, пока открыта карта.</Text>
            {loading ? <ActivityIndicator accessibilityLabel="Загружаем друзей" color={palette.olive} /> : null}
            {issue ? <Text accessibilityRole="alert" style={styles.error}>{issue}</Text> : null}
            {friends && friends.length > 0 ? (
              <ScrollView style={styles.friends} keyboardShouldPersistTaps="handled">
                {friends.map(friend => {
                  const checked = selected.includes(friend.id);
                  return (
                    <TouchableOpacity key={friend.id} accessibilityRole="checkbox" aria-checked={checked}
                      accessibilityLabel={friend.name + ', ID ' + friend.id} disabled={phase !== 'off'}
                      style={[styles.friend, checked && styles.checked]}
                      onPress={() => setSelected(ids => ids.includes(friend.id) ? ids.filter(id => id !== friend.id) : [...ids, friend.id])}>
                      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={palette.olive} />
                      <View style={styles.identity}>
                        <Text style={styles.name}>{friend.name}</Text>
                        <Text style={styles.hint}>ID {friend.id}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}
            {friends?.length === 0 && <Text style={styles.hint}>У вас пока нет подтверждённых друзей.</Text>}
            <View style={styles.actions}>
              {friends?.length === 0 ? (
                <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => { close(); onOpenFriends(); }}>
                  <Text style={styles.primaryText}>Открыть список друзей</Text>
                </TouchableOpacity>
              ) : !loading && !friends && issue ? (
                <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => void loadFriends()}>
                  <Text style={styles.primaryText}>Повторить</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity accessibilityRole="button" style={[styles.primary, (phase !== 'off' || selected.length === 0) && styles.disabled]}
                  disabled={phase !== 'off' || selected.length === 0} onPress={() => void start()}>
                  <Text style={styles.primaryText}>{phase === 'starting' ? 'Включаем показ…' : 'Начать показ'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const baseStyles = StyleSheet.create({
  trigger: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#F0ECD1' },
  activeTrigger: { backgroundColor: palette.olive },
  triggerText: { color: palette.forest, fontSize: 12, fontWeight: '600' },
  activeText: { color: palette.cream },
  backdrop: { flex: 1, backgroundColor: '#28361870', alignItems: 'center', justifyContent: 'center', padding: 18 },
  dialogCard: { width: '100%', maxWidth: 420, maxHeight: '85%', borderRadius: 24, backgroundColor: palette.surface, padding: 18, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: palette.forest, fontSize: 22, fontWeight: '700' },
  close: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  hint: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  error: { color: '#b42318', fontSize: 13, lineHeight: 18 },
  friends: { flexGrow: 0, flexShrink: 1, maxHeight: 260 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48, padding: 8, borderRadius: 10 },
  checked: { backgroundColor: '#F0ECD1' },
  identity: { flex: 1 },
  name: { color: palette.forest, fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  primary: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: palette.olive },
  primaryText: { color: palette.cream, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
});
