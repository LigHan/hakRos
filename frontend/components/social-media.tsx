import { useEvent } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { palette } from '@/lib/app-appearance';
import { API_URL } from '@/lib/statistics';

type MediaProps = { uri: string; kind: 'video' | 'image'; style?: StyleProp<ViewStyle>; active?: boolean; onRetry?: () => void };

export function SocialMedia(props: MediaProps) {
  const uri = props.uri.startsWith('/') ? `${API_URL}${props.uri}` : props.uri;
  const resolved = { ...props, uri };
  if (props.kind === 'video') return <VideoMedia key={uri} {...resolved} />;
  return <ImageMedia key={uri} {...resolved} />;
}

function ImageMedia({ uri, style, onRetry }: MediaProps) {
  const [failed, setFailed] = useState(false);
  return <View style={[styles.frame, style]}>
    <Image source={{ uri }} style={styles.image} resizeMode="contain" accessibilityLabel="Изображение публикации" onError={() => setFailed(true)} />
    {failed && <View style={styles.error}><Text style={styles.errorText}>Не удалось открыть изображение.</Text>{onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Обновить изображение</Text></Pressable>}</View>}
  </View>;
}

function VideoMedia({ uri, style, active = true, onRetry }: MediaProps) {
  const player = useVideoPlayer(uri, instance => { instance.loop = false; instance.muted = false; });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const loading = status === 'loading';
  const failed = status === 'error';
  useEffect(() => { if (!active) player.pause(); }, [active, player]);
  useFocusEffect(useCallback(() => () => {
    // The native player may already be released during an unmount.
    try { player.pause(); } catch { /* Nothing remains to pause after release. */ }
  }, [player]));

  return <View style={[styles.frame, style]}>
    <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls contentFit="contain" surfaceType="textureView" accessibilityLabel="Видео публикации" />
    {loading && !failed && <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={palette.cream} /></View>}
    {failed && <View style={styles.error}><Text style={styles.errorText}>Не удалось открыть видео. Проверьте подключение и обновите публикацию.</Text>{onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Обновить видео</Text></Pressable>}</View>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#20251C' },
  image: { width: '100%', height: '100%' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  error: { ...StyleSheet.absoluteFill, padding: 20, gap: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#20251C' },
  errorText: { color: palette.cream, textAlign: 'center', fontSize: 14, lineHeight: 21 },
  retry: { paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: palette.cream, borderRadius: 12 },
  retryText: { color: palette.cream, fontWeight: '700' },
});
