import { useEvent, useEventListener } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { palette } from '@/lib/app-appearance';
import { API_URL } from '@/lib/statistics';

type MediaProps = {
  uri: string;
  kind: 'video' | 'image';
  style?: StyleProp<ViewStyle>;
  active?: boolean;
  story?: boolean;
  muted?: boolean;
  onRetry?: () => void;
  onFailure?: () => void;
  onProgress?: (progress: number) => void;
  onEnd?: () => void;
};

export function SocialMedia(props: MediaProps) {
  const uri = props.uri.startsWith('/') ? `${API_URL}${props.uri}` : props.uri;
  const resolved = { ...props, uri };
  return props.kind === 'video' ? <VideoMedia key={uri} {...resolved} /> : <ImageMedia key={uri} {...resolved} />;
}

function ImageMedia({ uri, style, story, onRetry, onFailure }: MediaProps) {
  const [failed, setFailed] = useState(false);
  return <View style={[styles.frame, story && styles.storyFrame, style]}>
    <Image source={{ uri }} style={styles.image} resizeMode={story ? 'cover' : 'contain'} accessibilityLabel="Изображение публикации" onError={() => { setFailed(true); onFailure?.(); }} />
    {failed && <View style={styles.error}><Text style={styles.errorText}>Не удалось открыть изображение.</Text>{onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Обновить изображение</Text></Pressable>}</View>}
  </View>;
}

function VideoMedia({ uri, style, active = true, story = false, muted = false, onRetry, onFailure, onProgress, onEnd }: MediaProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const [ratio, setRatio] = useState(16 / 9);
  const player = useVideoPlayer(uri, instance => { instance.loop = false; instance.muted = muted; instance.timeUpdateEventInterval = 0.1; });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const loading = status === 'loading';
  const failed = status === 'error';
  useEventListener(player, 'statusChange', ({ status: nextStatus }) => { if (nextStatus === 'error') onFailure?.(); });
  useEventListener(player, 'sourceLoad', ({ availableVideoTracks }) => {
    const size = availableVideoTracks[0]?.size;
    if (size?.width && size.height) setRatio(size.width / size.height);
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (story && Number.isFinite(player.duration) && player.duration > 0) onProgress?.(Math.min(1, currentTime / player.duration));
  });
  useEventListener(player, 'playToEnd', () => { if (story) onEnd?.(); });
  useEffect(() => {
    if (story && active) player.play();
    else if (!active) player.pause();
  }, [active, player, story]);
  useEffect(() => {
    // expo-video exposes playback settings as mutable player properties.
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    if (Platform.OS !== 'web' || story) return;
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => { if (probe.videoWidth && probe.videoHeight) setRatio(probe.videoWidth / probe.videoHeight); };
    probe.src = uri;
    return () => { probe.removeAttribute('src'); probe.load(); };
  }, [story, uri]);
  useFocusEffect(useCallback(() => () => {
    try { player.pause(); } catch { /* Player may already be released. */ }
  }, [player]));
  const measure = (event: LayoutChangeEvent) => setContainerWidth(event.nativeEvent.layout.width);
  const videoHeight = containerWidth ? Math.min(containerWidth / Math.max(0.1, ratio), windowHeight * 0.62) : undefined;
  return <View onLayout={measure} style={[styles.frame, !story && videoHeight ? { aspectRatio: undefined, height: videoHeight } : null, story && styles.storyFrame, style]}>
    <VideoView player={player} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} nativeControls={!story} contentFit={story ? 'cover' : 'contain'} surfaceType="textureView" accessibilityLabel={story ? 'Видео истории' : 'Видео публикации'} />
    {loading && !failed && <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={palette.cream} /></View>}
    {failed && <View style={styles.error}><Text style={styles.errorText}>Не удалось открыть видео. Проверьте подключение и обновите публикацию.</Text>{onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Обновить видео</Text></Pressable>}</View>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#20251C' },
  storyFrame: { ...StyleSheet.absoluteFill, width: '100%', height: '100%', aspectRatio: undefined, borderRadius: 0 },
  image: { width: '100%', height: '100%' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  error: { ...StyleSheet.absoluteFill, padding: 20, gap: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#20251C' },
  errorText: { color: palette.cream, textAlign: 'center', fontSize: 14, lineHeight: 21 },
  retry: { paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: palette.cream, borderRadius: 12 },
  retryText: { color: palette.cream, fontWeight: '700' },
});
