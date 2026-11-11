import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {people.length === 0 && <Text style={styles.detail}>{empty}</Text>}
      {people.map(person => (
        <View key={person.id} style={styles.person}>
          <View style={styles.identity}>
            <Text style={styles.personName}>{person.name}</Text>
            <Text style={styles.detail}>ID {person.id}</Text>
          </View>
          <View style={styles.actions}>{actions(person)}</View>
        </View>
      ))}
    </View>
  );
}

export default function ConnectionsScreen() {
  const router = useRouter();
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
    <View style={styles.screen}>
      <Stack.Screen options={{
        title: 'Друзья',
        headerBackTitle: 'Профиль',
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#0f172a',
        headerShadowVisible: false,
      }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <View style={styles.top}>
            {connections && <Text selectable style={styles.personName}>Мой ID {connections.userId}</Text>}
            {!needsLogin && <Action title="Обновить" onPress={() => void refresh()} disabled={loading || busy} secondary />}
            {loading && <ActivityIndicator accessibilityLabel="Загрузка списка друзей" color="#2563eb" />}
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {needsLogin && <Action title="Войти" onPress={() => router.push('/login')} />}
          {connections && !needsLogin && (
            <View style={styles.search}>
              <TextInput
                accessibilityLabel="Имя или ID пользователя"
                placeholder="Имя или ID пользователя"
                placeholderTextColor="#64748b"
                style={styles.input}
                value={query}
                editable={!disabled}
                maxLength={100}
                returnKeyType="search"
                onChangeText={value => { setQuery(value); setResults(null); }}
                onSubmitEditing={() => void search()}
              />
              <Action title="Найти" onPress={() => void search()} disabled={disabled || !query.trim()} />
            </View>
          )}
        </View>

        {connections && !needsLogin && (
          <>
            {results && (
              <PeopleSection title="Результаты поиска" empty="Пользователь не найден." people={results} actions={person => {
                if (connections.friends.some(item => item.id === person.id)) return <Text style={styles.detail}>В друзьях</Text>;
                if (connections.incomingRequests.some(item => item.id === person.id)) return <Text style={styles.detail}>Входящая заявка</Text>;
                if (connections.outgoingRequests.some(item => item.id === person.id)) return <Text style={styles.detail}>Заявка отправлена</Text>;
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  sectionTitle: { color: '#0f172a', fontSize: 18, fontWeight: '700' },
  personName: { color: '#0f172a', fontSize: 16, fontWeight: '600' },
  error: { color: '#b42318', fontSize: 14, lineHeight: 20 },
  person: { gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  identity: { gap: 1 },
  detail: { color: '#64748b', fontSize: 14, lineHeight: 20 },
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
