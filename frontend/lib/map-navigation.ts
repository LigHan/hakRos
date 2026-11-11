import * as Location from 'expo-location';

import type { MapCoordinates, MapPoint } from '@/components/MapCanvas.types';
import { api } from '@/lib/statistics';

export type MapSearchResult = MapCoordinates & { id: string; title: string; subtitle: string };
export type TravelMode = 'walk' | 'drive';
export type MapRoute = { coordinates: [number, number][]; distance: number; duration: number };
export type RoutePlan = {
  mode: TravelMode;
  origin: (MapCoordinates & { title: string }) | null;
  pickingOrigin: boolean;
};

export function placeSearchResult(point: MapPoint): MapSearchResult {
  return { id: 'place-' + point.id, title: point.name, subtitle: 'Сохранённая точка', latitude: point.latitude, longitude: point.longitude };
}

export function findAddresses(query: string, signal?: AbortSignal): Promise<MapSearchResult[]> {
  return api('/api/map/search?q=' + encodeURIComponent(query), { signal });
}

export function findRoute(from: MapCoordinates, to: MapCoordinates, mode: TravelMode, signal?: AbortSignal): Promise<MapRoute> {
  return api('/api/map/route', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      from: { latitude: from.latitude, longitude: from.longitude },
      to: { latitude: to.latitude, longitude: to.longitude },
      mode,
    }),
  });
}

export async function currentMapCoordinates(): Promise<MapCoordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Разрешите доступ к геолокации в настройках устройства или браузера.');
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: coords.latitude, longitude: coords.longitude };
}
