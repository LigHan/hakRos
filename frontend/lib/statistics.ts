import { Platform } from 'react-native';
import { getUserSession } from './user-session';

export const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');
export async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}
export async function authorized(path: string, options: RequestInit = {}) {
  const session = await getUserSession();
  if (!session?.token) throw new Error('Войдите заново');
  return api(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${session.token}` } });
}
export function track(type: string, placeId?: string) {
  void authorized('/api/events', {method:'POST', body:JSON.stringify({type, ...(placeId ? {placeId} : {})})}).catch(() => {});
}

