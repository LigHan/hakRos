import { useEvent, useEventListener } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { palette } from '@/lib/app-appearance';
import { API_URL } from '@/lib/statistics';
import { clampMediaWidth, videoFrameHeight } from '@/lib/media-layout';

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
  const [ratio, setRatio] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const { height: windowHeight } = useWindowDimensions();
  useEffect(() => {
    let active = true;
    Image.getSize(uri, (imageWidth, imageHeight) => {
      if (active && imageWidth > 0 && imageHeight > 0) setRatio(imageWidth / imageHeight);
    }, () => {});
    return () => { active = false; };
  }, [uri]);
  const measure = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const height = ratio && width ? Math.min(width / ratio, windowHeight * 0.8) : undefined;
  return <View onLayout={measure} style={[styles.frame, style, story && styles.storyFrame, !story && height ? { aspectRatio: undefined, height } : null]}>
    <Image source={{ uri }} style={styles.image} resizeMode={story ? 'contain' : 'cover'} accessibilityLabel="Изображение публикации"
      onError={() => { setFailed(true); onFailure?.(); }} />
    {failed && <View style={styles.error}><Text style={styles.errorText}>Не удалось открыть изображение.</Text>{onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Обновить изображение</Text></Pressable>}</View>}
  </View>;
}

function VideoMedia({ uri, style, active = true, story = false, muted = false, onRetry, onFailure, onProgress, onEnd }: MediaProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const container = useRef<ComponentRef<typeof View>>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
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
    if (story && active && bounds.width > 0) player.play();
    else if (!active) player.pause();
  }, [active, bounds.width, player, story]);
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
  const measure = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout;
    container.current?.measureInWindow((x, _y, actualWidth, actualHeight) => {
      const width = clampMediaWidth(actualWidth || measured.width, x, windowWidth);
      const height = actualHeight || measured.height;
      if (width > 0 && height > 0) setBounds(current => Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5 ? current : { width, height });
    });
  };
  const videoHeight = videoFrameHeight(bounds.width || windowWidth, ratio, windowHeight);
  return <View ref={container} onLayout={measure} style={[styles.frame, style, story ? styles.storyFrame : { aspectRatio: undefined, width: '100%', maxWidth: '100%', height: videoHeight }]}>
    {bounds.width > 0 && bounds.height > 0 && <VideoView player={player} style={{ width: bounds.width, height: bounds.height }} nativeControls={!story} contentFit="contain" surfaceType="textureView" accessibilityLabel={story ? 'Видео истории' : 'Видео публикации'} />}
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
