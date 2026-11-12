import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

/** One request at a time, only while the screen is focused and the app is active. */
export function useMessagePolling(refresh: (signal: AbortSignal) => Promise<boolean | void>, delay: number) {
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | null = null;

    function suspend() {
      clearTimeout(timer);
      request?.abort();
      request = null;
    }

    async function poll() {
      if (request || (AppState.currentState && AppState.currentState !== 'active')) return;
      const controller = new AbortController();
      request = controller;
      const again = await refresh(controller.signal);
      if (request !== controller) return;
      request = null;
      if (again !== false) timer = setTimeout(() => void poll(), delay);
    }

    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') {
        clearTimeout(timer);
        void poll();
      } else suspend();
    });
    void poll();
    return () => {
      suspend();
      listener?.remove();
    };
  }, [refresh, delay, revision]));

  return useCallback(() => setRevision(value => value + 1), []);
}
