import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { MapCoordinates } from '@/components/MapCanvas.types';

async function watchPosition(update: (position: MapCoordinates | null) => void): Promise<Location.LocationSubscription> {
  const accept = ({ coords: { latitude, longitude } }: { coords: MapCoordinates }) => update({ latitude, longitude });
  const clear = () => update(null);
  if (Platform.OS === 'web') {
    const geolocation = navigator.geolocation;
    const id = geolocation.watchPosition(accept, clear, { maximumAge: 0, timeout: 15_000 });
    return { remove: () => geolocation.clearWatch(id) };
  }
  return Location.watchPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 10,
    timeInterval: 5_000,
    mayShowUserSettingsDialog: false,
  }, accept, clear);
}

export function useNearbyMapPosition(enabled: boolean, permissionCheck: number) {
  const [appState, setAppState] = useState(AppState.currentState);
  const [position, setPosition] = useState<MapCoordinates | null>(null);
  const foreground = appState === 'active' || appState == null;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setPosition(null);
    if (!enabled || !foreground) return;
    let active = true;
    let subscription: Location.LocationSubscription | undefined;
    const update = (coordinates: MapCoordinates | null) => {
      if (active) setPosition(coordinates);
    };
    const start = async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!active || !permission.granted) return;
      const watcher = await watchPosition(update);
      if (active) subscription = watcher;
      else watcher.remove();
    };
    void start().catch(() => update(null));
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [enabled, foreground, permissionCheck]);

  return enabled && foreground ? position : null;
}
