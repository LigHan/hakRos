import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { API_URL } from '@/lib/statistics';
import { palette } from '@/lib/app-appearance';

export function VideoPreview({ uri, style }: { uri: string; style?: StyleProp<ViewStyle> }) {
  const container = useRef<ComponentRef<typeof View>>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [failed, setFailed] = useState(false);
  const resolved = uri.startsWith('/') ? API_URL + uri : uri;
  useEffect(() => {
    const node = container.current as unknown as Element | null;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '250px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <View ref={container} style={[styles.preview, style]} pointerEvents="none">
    {visible && !failed && <video aria-hidden muted playsInline preload="metadata" src={resolved}
      onLoadedMetadata={event => { const video = event.currentTarget; if (Number.isFinite(video.duration) && video.duration > 0.2) video.currentTime = 0.1; }}
      onError={() => setFailed(true)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
    <View style={styles.scrim} /><Ionicons name="play-circle" size={50} color={palette.cream} />
  </View>;
}
const styles = StyleSheet.create({
  preview: { width: '100%', height: 180, borderRadius: 14, backgroundColor: palette.forest, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,25,14,0.15)' },
});
