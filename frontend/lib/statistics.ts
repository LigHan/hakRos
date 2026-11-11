import { Platform } from 'react-native';
import { getUserSession } from './user-session';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');
export async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || 'Ошибка сервера', response.status);
  return data;
}
export async function authorized(path: string, options: RequestInit = {}) {
  const session = await getUserSession();
  if (!session?.token) throw new ApiError('Войдите в аккаунт', 401);
  return api(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${session.token}` } });
}
export function track(type: string, placeId?: string) {
  void authorized('/api/events', {method:'POST', body:JSON.stringify({type, ...(placeId ? {placeId} : {})})}).catch(() => {});
}

