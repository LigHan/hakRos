import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { RoutePlayback } from '@/components/MapCanvas.types';
import type { MapRoute } from '@/lib/map-navigation';

export function playbackElapsed(playback: RoutePlayback, now: number) {
  const runningTime = playback.startedAt == null ? 0 : Math.max(0, now - playback.startedAt);
  return Math.min(playback.durationMs, playback.elapsedMs + runningTime);
}

export function useRoutePlayback() {
  const nextRun = useRef(0);
  const [playback, setPlayback] = useState<RoutePlayback | null>(null);

  const start = useCallback((route: MapRoute & { sequence: number }) => {
    const durationMs = route.distance === 0 ? 1 : Math.min(65_000, Math.max(10_000, route.duration * 1_000 / 30));
    setPlayback({
      runId: ++nextRun.current,
      routeSequence: route.sequence,
      durationMs,
      elapsedMs: 0,
      startedAt: Date.now(),
      followCamera: true,
    });
  }, []);

  const pause = useCallback(() => {
    const now = Date.now();
    setPlayback(current => current?.startedAt == null ? current : {
      ...current,
      startedAt: null,
      elapsedMs: playbackElapsed(current, now),
    });
  }, []);

  const resume = useCallback(() => {
    const now = Date.now();
    setPlayback(current => current && current.startedAt == null && current.elapsedMs < current.durationMs
      ? { ...current, startedAt: now }
      : current);
  }, []);

  const stop = useCallback(() => setPlayback(null), []);
  const toggleCamera = useCallback(() => {
    setPlayback(current => current && { ...current, followCamera: !current.followCamera });
  }, []);
  const releaseCamera = useCallback((runId: number) => {
    setPlayback(current => current?.runId === runId && current.followCamera
      ? { ...current, followCamera: false }
      : current);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') pause();
    });
    return () => subscription.remove();
  }, [pause]);

  const { runId, startedAt, elapsedMs, durationMs } = playback ?? {};
  useEffect(() => {
    if (startedAt == null || elapsedMs == null || durationMs == null) return;
    const remainingMs = durationMs - elapsedMs - (Date.now() - startedAt);
    const timer = setTimeout(() => {
      setPlayback(current => current && current.runId === runId && current.startedAt === startedAt
        ? { ...current, startedAt: null, elapsedMs: durationMs }
        : current);
    }, Math.max(0, remainingMs));
    return () => clearTimeout(timer);
  }, [runId, startedAt, elapsedMs, durationMs]);

  return { playback, start, pause, resume, stop, toggleCamera, releaseCamera };
}
