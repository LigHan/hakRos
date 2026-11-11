import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { findPeople, getConnections, updateFriend, type Connections, type Person } from '@/lib/connections';
import { ApiError } from '@/lib/statistics';

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

function PeopleSection({ title, empty, people, actions }: {
  title: string;
  empty: string;
  people: Person[];
  actions: (person: Person) => ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle" accessibilityRole="header">{title}</ThemedText>
      {people.length === 0 && <ThemedText style={styles.detail}>{empty}</ThemedText>}
      {people.map(person => (
        <View key={person.id} style={styles.person}>
          <View style={styles.identity}>
            <ThemedText type="defaultSemiBold">{person.name}</ThemedText>
            <ThemedText style={styles.detail}>ID {person.id}</ThemedText>
          </View>
          <View style={styles.actions}>{actions(person)}</View>
        </View>
      ))}
    </View>
  );
}

export default function ConnectionsScreen() {
  const router = useRouter();
  const inputColor = useThemeColor({}, 'text');
  const [connections, setConnections] = useState<Connections | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  const reportError = useCallback((cause: unknown, fallback: string) => {
    const expired = cause instanceof ApiError && cause.status === 401;
    setNeedsLogin(expired);
    setError(expired ? 'Войдите, чтобы открыть список друзей.' : cause instanceof ApiError ? cause.message : fallback);
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    setNeedsLogin(false);
    try {
      const data = await getConnections(signal);
      if (!signal?.aborted) setConnections(data);
    } catch (cause) {
      if (!signal?.aborted) reportError(cause, 'Не удалось загрузить список друзей.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [reportError]);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setConnections(null);
    setResults(null);
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]));

  const search = async () => {
    const term = query.trim();
    if (!term || loading || busy) return;

    setBusy(true);
    setError('');
    setResults(null);
    try {
      setResults(await findPeople(term));
    } catch (cause) {
      reportError(cause, 'Не удалось найти пользователя.');
    } finally {
      setBusy(false);
    }
  };

  const changeFriend = async (person: Person, action: Parameters<typeof updateFriend>[1]) => {
    if (loading || busy) return;

    setBusy(true);
    setError('');
    try {
      await updateFriend(person.id, action);
      await refresh();
    } catch (cause) {
      reportError(cause, 'Не удалось изменить список друзей.');
    } finally {
      setBusy(false);
    }
  };

  const disabled = loading || busy || needsLogin;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: 'Друзья', headerBackTitle: 'Профиль' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          {connections && <ThemedText selectable type="defaultSemiBold">Мой ID {connections.userId}</ThemedText>}
          {!needsLogin && <Action title="Обновить" onPress={() => void refresh()} disabled={loading || busy} secondary />}
          {loading && <ActivityIndicator accessibilityLabel="Загрузка списка друзей" color="#2563eb" />}
        </View>
        {error ? <ThemedText accessibilityRole="alert" lightColor="#b42318" darkColor="#fda29b">{error}</ThemedText> : null}
        {needsLogin && <Action title="Войти" onPress={() => router.push('/login')} />}

        {connections && !needsLogin && (
          <>
            <View style={styles.search}>
              <TextInput
                accessibilityLabel="Имя или ID пользователя"
                placeholder="Имя или ID пользователя"
                placeholderTextColor="#94a3b8"
                style={[styles.input, { color: inputColor }]}
                value={query}
                editable={!disabled}
                maxLength={100}
                returnKeyType="search"
                onChangeText={value => { setQuery(value); setResults(null); }}
                onSubmitEditing={() => void search()}
              />
              <Action title="Найти" onPress={() => void search()} disabled={disabled || !query.trim()} />
            </View>
            {results && (
              <PeopleSection title="Результаты поиска" empty="Пользователь не найден." people={results} actions={person => {
                if (connections.friends.some(item => item.id === person.id)) return <ThemedText>В друзьях</ThemedText>;
                if (connections.incomingRequests.some(item => item.id === person.id)) return <ThemedText>Входящая заявка</ThemedText>;
                if (connections.outgoingRequests.some(item => item.id === person.id)) return <ThemedText>Заявка отправлена</ThemedText>;
                return <Action title="Добавить" disabled={disabled} onPress={() => void changeFriend(person, 'request')} />;
              }} />
            )}

            <PeopleSection title="Входящие заявки" empty="Нет входящих заявок." people={connections.incomingRequests} actions={person => (
              <>
                <Action title="Принять" disabled={disabled} onPress={() => void changeFriend(person, 'accept')} />
                <Action title="Отклонить" secondary disabled={disabled} onPress={() => void changeFriend(person, 'remove')} />
              </>
            )} />
            <PeopleSection title="Отправленные заявки" empty="Нет отправленных заявок." people={connections.outgoingRequests} actions={person => (
              <Action title="Отменить" secondary disabled={disabled} onPress={() => void changeFriend(person, 'remove')} />
            )} />
            <PeopleSection title="Мои друзья" empty="Найдите друга по имени или ID." people={connections.friends} actions={person => (
              <Action title="Удалить из друзей" secondary disabled={disabled} onPress={() => void changeFriend(person, 'remove')} />
            )} />
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 12,
  },
  section: { gap: 8, paddingTop: 10 },
  person: { gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#94a3b8' },
  identity: { gap: 1 },
  detail: { opacity: 0.75, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  secondaryAction: { backgroundColor: '#dbeafe' },
  disabled: { opacity: 0.55 },
  actionText: { color: '#fff', fontWeight: '700' },
  secondaryText: { color: '#1d4ed8' },
});
