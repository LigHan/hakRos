import { useEffect, useRef, useState } from 'react';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { API_URL } from '@/lib/statistics';
import type { MapCanvasProps } from './MapCanvas.types';

export default function MapCanvas({ state, onSelect, onError, onSubmit, onOpenPlace }: MapCanvasProps) {
  const frame = useRef<WebView<WebViewProps>>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) frame.current?.injectJavaScript(`window.applyMapState(${JSON.stringify(state).replace(/</g, '\\u003c')}); true;`);
  }, [ready, state]);
  const receive = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') setReady(true);
      if (data.type === 'click' && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) onSelect(data.latitude, data.longitude);
      if (data.type === 'error') onError(String(data.message));
      if (data.type === 'submit' && typeof data.id === 'string') onSubmit(data.id);
      if (data.type === 'open-place' && typeof data.id === 'string') onOpenPlace(data.id);
    } catch { onError('Некорректный ответ карты'); }
  };
  return <WebView<WebViewProps> ref={frame} source={{ uri: `${API_URL}/map-assets/` }} onLoadStart={() => setReady(false)} onMessage={receive} onError={() => onError('Не удалось загрузить карту')} style={{ flex: 1 }} />;
}
