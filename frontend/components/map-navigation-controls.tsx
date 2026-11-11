import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { palette, useAppStyles } from '@/lib/app-appearance';
import type { MapRoute, MapSearchResult, RoutePlan, TravelMode } from '@/lib/map-navigation';

export type MapSearchState = {
  results: MapSearchResult[];
  pending: boolean;
  message?: string;
  planOnSelect: boolean;
};

export function MapSearchResults({ search, onSelect, onClose }: {
  search: MapSearchState;
  onSelect: (result: MapSearchResult) => void;
  onClose: () => void;
}) {
  const styles = useAppStyles(baseStyles);
  return (
    <View style={styles.resultsPanel}>
      <View style={styles.resultHeader}>
        {search.pending ? <ActivityIndicator size="small" color={palette.olive} /> : null}
        <Text accessibilityLiveRegion="polite" style={[styles.hint, styles.grow]}>
          {search.pending ? 'Ищем адрес…' : search.message || 'Выберите адрес или место'}
        </Text>
        <Close label="Закрыть результаты поиска" onPress={onClose} />
      </View>
      {search.results.length > 0 && (
        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {search.results.map(result => (
            <TouchableOpacity key={result.id} accessibilityRole="button" onPress={() => onSelect(result)} style={styles.result}>
              <Ionicons aria-hidden name="location-outline" size={18} color={palette.olive} />
              <View style={styles.grow}>
                <Text style={styles.title}>{result.title}</Text>
                {result.subtitle ? <Text style={styles.hint}>{result.subtitle}</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

type Status = 'idle' | 'locating' | 'routing';
const modes = [{ value: 'walk', label: 'Пешком' }, { value: 'drive', label: 'На авто' }] as const;

function Close({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={baseStyles.close}>
      <Ionicons name="close" size={20} color={palette.muted} />
    </TouchableOpacity>
  );
}

function Button({ label, onPress, disabled = false, primary = false }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={[baseStyles.button, primary && baseStyles.primary, disabled && baseStyles.disabled]}>
      <Text style={[baseStyles.buttonText, primary && baseStyles.primaryText]}>{label}</Text>
    </TouchableOpacity>
  );
}

function routeSummary(route: MapRoute) {
  const distance = route.distance < 1000
    ? Math.round(route.distance) + ' м'
    : (route.distance / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' км';
  const minutes = Math.max(1, Math.round(route.duration / 60));
  const duration = minutes < 60 ? minutes + ' мин' : Math.floor(minutes / 60) + ' ч ' + minutes % 60 + ' мин';
  return distance + ' · ' + duration;
}

export function MapRoutePanel({ destination, plan, route, status, error, onPlan, onClose, onMode, onLocate, onPickOrigin, onEditOrigin, onBuild }: {
  destination: MapSearchResult;
  plan: RoutePlan | null;
  route: MapRoute | null;
  status: Status;
  error: string;
  onPlan: () => void;
  onClose: () => void;
  onMode: (mode: TravelMode) => void;
  onLocate: () => void;
  onPickOrigin: () => void;
  onEditOrigin: () => void;
  onBuild: () => void;
}) {
  const styles = useAppStyles(baseStyles);
  const busy = status !== 'idle';
  return (
    <View style={styles.routeContent}>
      <View style={styles.resultHeader}>
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={styles.routeTitle}>{destination.title}</Text>
          {destination.subtitle ? <Text style={styles.hint}>{destination.subtitle}</Text> : null}
        </View>
        <Close label="Закрыть карточку маршрута" onPress={onClose} />
      </View>
      {!plan ? (
        <Button label="Проложить маршрут" primary onPress={onPlan} />
      ) : (
        <>
          <View style={styles.actions}>
            {modes.map(mode => (
              <TouchableOpacity key={mode.value} accessibilityRole="button" aria-pressed={plan.mode === mode.value}
                disabled={busy} onPress={() => onMode(mode.value)}
                style={[styles.button, plan.mode === mode.value && styles.primary]}>
                <Text style={[styles.buttonText, plan.mode === mode.value && styles.primaryText]}>{mode.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {route ? (
            <View style={styles.routeSummary}>
              <Text accessibilityLiveRegion="polite" style={styles.summary}>{routeSummary(route)}</Text>
              <Button label="Изменить старт" onPress={onEditOrigin} />
            </View>
          ) : (
            <>
              <Text style={styles.hint}>
                {plan.pickingOrigin ? 'Нажмите на карту, чтобы выбрать старт' : plan.origin ? 'Старт · ' + plan.origin.title : 'Выберите начальную точку'}
              </Text>
              <View style={styles.actions}>
                <Button label={status === 'locating' ? 'Определяем положение…' : 'От моего местоположения'} disabled={busy} onPress={onLocate} />
                <Button label={plan.pickingOrigin ? 'Отменить выбор' : 'Выбрать старт на карте'} disabled={busy} onPress={onPickOrigin} />
              </View>
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <Button label={status === 'routing' ? 'Строим маршрут…' : 'Построить маршрут'}
                primary disabled={busy || !plan.origin || plan.pickingOrigin} onPress={onBuild} />
            </>
          )}
        </>
      )}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  resultsPanel: { marginTop: 8, maxHeight: '30%', flexShrink: 1, borderRadius: 14, paddingHorizontal: 12, backgroundColor: palette.surface },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  close: { width: 34, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  routeContent: { gap: 8, paddingBottom: 4 },
  title: { color: palette.forest, fontSize: 15, fontWeight: '700' },
  routeTitle: { color: palette.forest, fontSize: 20, fontWeight: '700' },
  hint: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  error: { color: '#b42318', fontSize: 13 },
  routeSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  summary: { color: palette.forest, fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F0ECD1' },
  buttonText: { color: palette.forest, fontWeight: '600', fontSize: 13 },
  primary: { backgroundColor: palette.olive },
  primaryText: { color: palette.cream },
  disabled: { opacity: 0.55 },
});
