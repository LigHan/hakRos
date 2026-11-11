import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MapCanvas from '@/components/MapCanvas';
import type { MapCoordinates, MapState } from '@/components/MapCanvas.types';
import { palette, useAppStyles } from '@/lib/app-appearance';
import { addressAtPoint, findAddressSuggestions, type AddressSuggestion } from '@/lib/map-navigation';

type PlaceAddress = { address: string; coordinates: MapCoordinates | null };

type Lookup = { query: string; suggestions: AddressSuggestion[]; pending?: boolean; message?: string };

function AddressChoices({ suggestions, onSelect }: { suggestions: AddressSuggestion[]; onSelect: (choice: AddressSuggestion) => void }) {
  const styles = useAppStyles(baseStyles);
  return suggestions.map(choice => (
    <Pressable key={choice.id} accessibilityRole="button" onPress={() => onSelect(choice)} style={styles.suggestion}>
      <Ionicons name="location-outline" size={18} color={palette.olive} />
      <Text style={styles.suggestionText}>{choice.address}</Text>
    </Pressable>
  ));
}

export function CompanyPlaceAddress({ address, coordinates, disabled, onChange }: PlaceAddress & {
  disabled: boolean;
  onChange: (value: PlaceAddress) => void;
}) {
  const styles = useAppStyles(baseStyles);
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const visibleLookup = !mapOpen && !disabled && lookup?.query === query ? lookup : null;

  useEffect(() => {
    const text = query.trim();
    if (disabled || mapOpen || text.length < 3 || text.length > 160) return;
    const request = new AbortController();
    const timer = setTimeout(() => {
      setLookup({ query, suggestions: [], pending: true });
      void findAddressSuggestions(text, request.signal).then(suggestions => {
        if (!request.signal.aborted) {
          setLookup({ query, suggestions, message: suggestions.length ? undefined : 'Уточните адрес или выберите точку на карте.' });
        }
      }).catch(() => {
        if (!request.signal.aborted) setLookup({ query, suggestions: [], message: 'Подсказки недоступны. Адрес можно ввести вручную.' });
      });
    }, 800);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [disabled, mapOpen, query]);

  const apply = (value: PlaceAddress) => {
    onChange(value);
    setQuery('');
    setLookup(null);
    setMapOpen(false);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Адрес</Text>
      <TextInput accessibilityLabel="Адрес" value={address} editable={!disabled} maxLength={2000}
        onChangeText={text => {
          if (text === address) return;
          setQuery(text);
          setLookup(null);
          onChange({ address: text, coordinates: null });
        }} style={styles.input} />
      {visibleLookup?.pending && <Text accessibilityLiveRegion="polite" style={styles.detail}>Ищем адрес…</Text>}
      {visibleLookup?.message && <Text accessibilityLiveRegion="polite" style={styles.detail}>{visibleLookup.message}</Text>}
      {visibleLookup && <AddressChoices suggestions={visibleLookup.suggestions}
        onSelect={({ address, latitude, longitude }) => apply({ address, coordinates: { latitude, longitude } })} />}
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => {
        Keyboard.dismiss();
        setMapOpen(true);
      }} style={[styles.mapButton, disabled && styles.disabled]}>
        <Ionicons name="map-outline" size={20} color={palette.olive} />
        <Text style={styles.mapButtonText}>Посмотреть на карте</Text>
      </Pressable>
      <Text style={styles.detail}>{coordinates ? 'Точка привязана к адресу.' : 'Выберите подсказку или точку, чтобы заведение появилось на карте.'}</Text>
      {mapOpen && <PlaceLocationPicker initialAddress={address} initialCoordinates={coordinates}
        onCancel={() => setMapOpen(false)} onApply={apply} />}
    </View>
  );
}

function PlaceLocationPicker({ initialAddress, initialCoordinates, onCancel, onApply }: {
  initialAddress: string;
  initialCoordinates: MapCoordinates | null;
  onCancel: () => void;
  onApply: (value: PlaceAddress) => void;
}) {
  const styles = useAppStyles(baseStyles);
  const [address, setAddress] = useState(initialAddress);
  const [coordinates, setCoordinates] = useState(initialCoordinates);
  const [center, setCenter] = useState<MapState['center']>(initialCoordinates && { ...initialCoordinates, sequence: 1 });
  const [choices, setChoices] = useState<AddressSuggestion[]>([]);
  const text = initialAddress.trim();
  const searchInitialAddress = !initialCoordinates && text.length >= 2 && text.length <= 160;
  const [pending, setPending] = useState(searchInitialAddress);
  const [message, setMessage] = useState('');
  const [mapError, setMapError] = useState('');
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (searchInitialAddress) {
      const request = new AbortController();
      activeRequest.current = request;
      void findAddressSuggestions(text, request.signal).then(results => {
        if (request.signal.aborted) return;
        if (results.length === 1) {
          const { latitude, longitude, address } = results[0];
          setCoordinates({ latitude, longitude });
          setCenter({ latitude, longitude, sequence: 1 });
          setAddress(address);
        } else {
          setChoices(results);
          setMessage(results.length ? 'Уточните адрес из списка или нажмите на карту.' : 'Укажите точку на карте или проверьте адрес.');
        }
      }).catch(() => {
        if (!request.signal.aborted) setMessage('Поиск адреса недоступен. Укажите точку на карте.');
      }).finally(() => {
        if (!request.signal.aborted) setPending(false);
      });
    }
    return () => activeRequest.current?.abort();
  }, [searchInitialAddress, text]);

  const selectPoint = async (latitude: number, longitude: number) => {
    const point = { latitude, longitude };
    activeRequest.current?.abort();
    const request = new AbortController();
    activeRequest.current = request;
    setCoordinates(point);
    setChoices([]);
    setMessage('');
    setPending(true);
    try {
      const result = await addressAtPoint(point, request.signal);
      if (request.signal.aborted) return;
      if (result) setAddress(result);
      else setMessage('Проверьте адрес или введите его вручную для выбранной точки.');
    } catch {
      if (!request.signal.aborted) setMessage('Не удалось определить адрес. Проверьте его или введите вручную.');
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  };

  const mapState = useMemo<MapState>(() => ({
    places: [], people: [], selected: coordinates, center, destination: null, routeStart: null, route: null,
  }), [coordinates, center]);
  const canApply = Boolean(coordinates && address.trim()) && !pending;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.picker} accessibilityViewIsModal>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.pickerHeader}>
              <View style={styles.heading}>
                <Text accessibilityRole="header" style={styles.title}>Место на карте</Text>
                <Text style={styles.detail}>Нажмите на карту, чтобы уточнить точку.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Закрыть карту" onPress={onCancel} style={styles.close}>
                <Ionicons name="close" size={23} color={palette.forest} />
              </Pressable>
            </View>
            <View style={styles.map}>
              <MapCanvas state={mapState} onSelect={(latitude, longitude) => void selectPoint(latitude, longitude)} onError={setMapError} />
            </View>
            <ScrollView style={styles.pickerFooter} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled">
              {mapError ? <Text accessibilityRole="alert" style={styles.detail}>{mapError}</Text> : null}
              {choices.length > 0 && <AddressChoices suggestions={choices} onSelect={choice => {
                const point = { latitude: choice.latitude, longitude: choice.longitude };
                setCoordinates(point);
                setAddress(choice.address);
                setCenter(current => ({ ...point, sequence: (current?.sequence ?? 0) + 1 }));
                setChoices([]);
                setMessage('');
              }} />}
              <TextInput accessibilityLabel="Адрес на карте" placeholder="Адрес" placeholderTextColor={palette.muted}
                value={address} maxLength={2000} style={styles.input} onChangeText={value => {
                  activeRequest.current?.abort();
                  setAddress(value);
                  setPending(false);
                  setChoices([]);
                  setMessage('');
                }} />
              {pending || message ? <Text accessibilityLiveRegion="polite" style={styles.detail}>{pending ? 'Определяем адрес…' : message}</Text> : null}
              <Pressable accessibilityRole="button" disabled={!canApply} style={[styles.apply, !canApply && styles.disabled]}
                onPress={() => onApply({ address: address.trim(), coordinates })}>
                <Text style={styles.applyText}>Применить адрес</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: palette.forest, fontSize: 14, fontWeight: '600' },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: palette.surface, color: palette.forest },
  detail: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  suggestion: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: palette.cream, borderRadius: 10 },
  suggestionText: { flex: 1, color: palette.forest, fontSize: 14 },
  mapButton: { minHeight: 44, paddingHorizontal: 12, alignSelf: 'flex-start', alignItems: 'center', flexDirection: 'row', gap: 8, borderRadius: 12, backgroundColor: '#F0ECD1' },
  mapButtonText: { color: palette.forest, fontWeight: '600' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(40,54,24,0.38)' },
  picker: { flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 520 : undefined, backgroundColor: palette.cream, overflow: 'hidden' },
  flex: { flex: 1 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 16 },
  heading: { flex: 1, gap: 3 },
  title: { color: palette.forest, fontSize: 20, fontWeight: '700' },
  close: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  map: { flex: 1, minHeight: 100, backgroundColor: palette.surface },
  pickerFooter: { flexGrow: 0, maxHeight: '45%', backgroundColor: palette.surface },
  pickerContent: { gap: 8, padding: 14 },
  apply: { minHeight: 44, borderRadius: 12, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: palette.cream, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
