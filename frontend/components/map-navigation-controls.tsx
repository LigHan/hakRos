import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RoutePlayback } from '@/components/MapCanvas.types';
import { palette, useAppStyles } from '@/lib/app-appearance';
import type { MapRoute, MapSearchResult, RoutePlan, TravelMode } from '@/lib/map-navigation';
import { playbackElapsed } from '@/lib/use-route-playback';

export type MapSearchState = {
  results: MapSearchResult[];
  pending: boolean;
  message?: string;
  planOnSelect: boolean;
  manual?: boolean;
};

export function MapSearchResults({ search, onSelect, onClose, onPickPoint }: {
  search: MapSearchState;
  onSelect: (result: MapSearchResult) => void;
  onClose: () => void;
  onPickPoint: () => void;
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
      {search.manual && !search.pending && <TouchableOpacity accessibilityRole="button" onPress={onPickPoint} style={styles.result}>
        <Ionicons name="locate-outline" size={18} color={palette.olive} />
        <Text style={styles.title}>Выбрать точку на карте вручную</Text>
      </TouchableOpacity>}
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

function formatDistance(meters: number) {
  return meters < 1000 ? Math.round(meters) + ' м'
    : (meters / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' км';
}

function routeSummary(route: MapRoute) {
  const minutes = Math.max(1, Math.round(route.duration / 60));
  const duration = minutes < 60 ? minutes + ' мин' : Math.floor(minutes / 60) + ' ч ' + minutes % 60 + ' мин';
  return formatDistance(route.distance) + ' · ' + duration;
}

type PlaybackActions = {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleCamera: () => void;
};

function RouteProgress({ route, playback, onStart, onPause, onResume, onStop, onToggleCamera }: PlaybackActions & {
  route: MapRoute;
  playback: RoutePlayback;
}) {
  const styles = useAppStyles(baseStyles);
  const [now, setNow] = useState(Date.now);
  const playing = playback.startedAt != null;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [playing]);
  const complete = playback.elapsedMs >= playback.durationMs;
  const fraction = playbackElapsed(playback, now) / playback.durationMs;
  const percent = complete ? 100 : Math.min(99, Math.floor(fraction * 100));

  return (
    <View style={styles.playbackPanel}>
      <View style={styles.playbackSummary}>
        <Text accessibilityLiveRegion="polite" style={[styles.summary, styles.grow]}>
          {complete ? 'Маршрут пройден' : playing ? 'Симуляция маршрута' : 'Симуляция на паузе'}
        </Text>
        <Text style={styles.progressValue}>{percent}%</Text>
        {!complete && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Следовать за маркером"
            aria-pressed={playback.followCamera} onPress={onToggleCamera}
            style={[styles.button, styles.cameraButton, playback.followCamera && styles.primary]}>
            <Ionicons name={playback.followCamera ? 'locate' : 'locate-outline'} size={20}
              color={playback.followCamera ? palette.cream : palette.forest} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel="Пройдено"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
      {!complete && <Text style={styles.hint}>Осталось {formatDistance(route.distance * (1 - fraction))}</Text>}
      <View style={styles.actions}>
        {complete ? (
          <>
            <Button label="Повторить" primary onPress={onStart} />
            <Button label="К маршруту" onPress={onStop} />
          </>
        ) : (
          <>
            <Button label={playing ? 'Пауза' : 'Продолжить'} primary onPress={playing ? onPause : onResume} />
            <Button label="Завершить" onPress={onStop} />
          </>
        )}
      </View>
    </View>
  );
}

export function MapRoutePanel({ destination, plan, route, status, error, playback, canStart,
  onPlan, onClose, onMode, onLocate, onPickOrigin, onEditOrigin, onBuild, ...playbackActions }: PlaybackActions & {
  destination: MapSearchResult;
  plan: RoutePlan | null;
  route: MapRoute | null;
  status: Status;
  error: string;
  playback: RoutePlayback | null;
  canStart: boolean;
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
      {route && playback ? (
        <RouteProgress key={playback.runId} route={route} playback={playback} {...playbackActions} />
      ) : !plan ? (
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
            <>
              <Text accessibilityLiveRegion="polite" style={styles.summary}>{routeSummary(route)}</Text>
              <View style={styles.actions}>
                <Button label={canStart ? 'Начать маршрут' : 'Загружаем карту…'} primary disabled={!canStart} onPress={playbackActions.onStart} />
                <Button label="Изменить старт" onPress={onEditOrigin} />
              </View>
            </>
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
  summary: { color: palette.forest, fontSize: 16, fontWeight: '700' },
  playbackPanel: { gap: 7, paddingTop: 2 },
  playbackSummary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressValue: { color: palette.forest, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#E5DFC2', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: palette.olive },
  cameraButton: { minWidth: 44, paddingHorizontal: 9, alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F0ECD1' },
  buttonText: { color: palette.forest, fontWeight: '600', fontSize: 13 },
  primary: { backgroundColor: palette.olive },
  primaryText: { color: palette.cream },
  disabled: { opacity: 0.55 },
});
