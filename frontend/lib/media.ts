import type { ImagePickerAsset } from 'expo-image-picker';
import { File as NativeFile } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import { API_URL, ApiError } from '@/lib/statistics';
import { getUserSession } from '@/lib/user-session';

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export type UploadedMedia = { id: string; url: string; mimeType: string; kind: 'image' | 'video' };
const videoMimeTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function videoMimeType(asset: ImagePickerAsset): string {
  const mime = asset.mimeType?.toLowerCase();
  if (mime && videoMimeTypes.has(mime)) return mime;
  const name = (asset.fileName || asset.uri).split('?')[0].toLowerCase();
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
  throw new Error('Выберите видео MP4, MOV или WebM.');
}

export function checkVideoAsset(asset: ImagePickerAsset, maxDurationSeconds?: number): void {
  if (asset.type !== 'video') throw new Error('Выберите видео.');
  videoMimeType(asset);
  if (asset.fileSize != null && asset.fileSize > MAX_MEDIA_BYTES) throw new Error('Видео должно быть не больше 25 МБ. Выберите короткий ролик или уменьшите его размер.');
  if (maxDurationSeconds && asset.duration != null && asset.duration > maxDurationSeconds * 1000 + 500) throw new Error(`Для истории запишите видео длительностью до ${maxDurationSeconds} секунд.`);
}

export function imageMimeType(asset: ImagePickerAsset): string {
  const mime = asset.mimeType?.toLowerCase();
  if (mime && imageMimeTypes.has(mime)) return mime;
  const name = (asset.fileName || asset.uri).split('?')[0].toLowerCase();
  if (/\.(jpg|jpeg)$/.test(name)) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  throw new Error('Выберите фото JPEG, PNG или WebP.');
}

export function checkMediaAsset(asset: ImagePickerAsset): void {
  if (asset.type === 'video') return checkVideoAsset(asset);
  if (asset.type !== 'image') throw new Error('Выберите фото или видео.');
  imageMimeType(asset);
  if (asset.fileSize != null && asset.fileSize > MAX_MEDIA_BYTES) throw new Error('Фото должно быть не больше 25 МБ.');
}

/** Upload file bytes to the shared server; local URIs never become published media URLs. */
export async function uploadMedia(asset: ImagePickerAsset): Promise<UploadedMedia> {
  checkMediaAsset(asset);
  const session = await getUserSession();
  if (!session?.token) throw new ApiError('Войдите в аккаунт перед загрузкой файла.', 401);
  const mimeType = asset.type === 'video' ? videoMimeType(asset) : imageMimeType(asset);
  const body = Platform.OS === 'web' ? asset.file ?? await (await fetch(asset.uri)).blob() : new NativeFile(asset.uri);
  if (!body.size) throw new Error('Файл пустой или больше недоступен. Выберите его ещё раз.');
  if (body.size > MAX_MEDIA_BYTES) throw new Error('Файл должен быть не больше 25 МБ.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await expoFetch(`${API_URL}/api/media`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': mimeType }, body, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error || (response.status === 413 ? 'Файл должен быть не больше 25 МБ.' : 'Не удалось загрузить файл. Проверьте подключение и повторите.'), response.status);
    if (!data?.id || !data.url || data.kind !== asset.type) throw new Error('Сервер не подтвердил загрузку файла.');
    return { id: String(data.id), url: data.url.startsWith('/') ? `${API_URL}${data.url}` : data.url, mimeType: data.mimeType, kind: data.kind };
  } catch (cause) {
    if (controller.signal.aborted) throw new Error('Загрузка заняла слишком много времени. Проверьте соединение и повторите.');
    throw cause;
  } finally { clearTimeout(timeout); }
}
