import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/statistics';
import type { MapCanvasProps } from './MapCanvas.types';

export default function MapCanvas({ state, onSelect, onError, onSubmit, onOpenPlace }: MapCanvasProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const origin = new URL(API_URL).origin;
  const send = useCallback(() => frame.current?.contentWindow?.postMessage({ type: 'hakros-map-state', state }, origin), [origin, state]);
  useEffect(() => { if (ready) send(); }, [ready, send]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow || !event.data) return;
      if (event.data.type === 'ready') setReady(true);
      if (event.data.type === 'click' && Number.isFinite(event.data.latitude) && Number.isFinite(event.data.longitude)) onSelect(event.data.latitude, event.data.longitude);
      if (event.data.type === 'error') onError(String(event.data.message));
      if (event.data.type === 'submit' && typeof event.data.id === 'string') onSubmit?.(event.data.id);
      if (event.data.type === 'open-place' && typeof event.data.id === 'string') onOpenPlace?.(event.data.id);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [origin, onSelect, onError, onSubmit, onOpenPlace]);
  return <iframe ref={frame} title="Карта мест" src={`${API_URL}/map-assets/`} style={{ border: 0, width: '100%', height: '100%', flex: 1 }} />;
}
