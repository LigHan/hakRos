import type { Person } from '@/lib/connections';
import { ApiError, authorized } from '@/lib/statistics';

export type FriendMessage = {
  id: number;
  body: string;
  createdAt: string;
  mine: boolean;
};

export type ConversationSummary = {
  friend: Person;
  latest: FriendMessage;
  unread: number;
};

export type MessagePage = {
  friend: Person;
  messages: FriendMessage[];
  hasMore: boolean;
};

const base = '/api/messages';
const conversation = (friendId: string) => `${base}/${encodeURIComponent(friendId)}`;
export const maxMessageLength = 2000;
export const inboxRefreshMs = 6000;
export const chatRefreshMs = 3000;

export function getUnreadMessages(signal?: AbortSignal): Promise<{ unread: number }> {
  return authorized(`${base}/unread`, { signal });
}

export function listConversations(signal?: AbortSignal): Promise<{ conversations: ConversationSummary[] }> {
  return authorized(base, { signal });
}

export function getMessagePage(friendId: string, cursor: { before: number } | { after: number } | null, signal?: AbortSignal): Promise<MessagePage> {
  const query = cursor ? ('before' in cursor ? `?before=${cursor.before}` : `?after=${cursor.after}`) : '';
  return authorized(conversation(friendId) + query, { signal });
}

export function sendFriendMessage(friendId: string, body: string, requestId: string, signal?: AbortSignal): Promise<FriendMessage> {
  return authorized(conversation(friendId), { method: 'POST', body: JSON.stringify({ body, requestId }), signal });
}

export function markMessagesRead(friendId: string, throughId: number, signal?: AbortSignal): Promise<{ ok: true }> {
  return authorized(`${conversation(friendId)}/read`, { method: 'PUT', body: JSON.stringify({ throughId }), signal });
}

export function messageAccessProblem(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return { kind: 'login' as const, text: 'Войдите, чтобы переписываться с друзьями.' };
    if (error.status === 403) return { kind: 'restricted' as const, text: 'Сообщения доступны в личном аккаунте.' };
    if (error.status === 404) return { kind: 'restricted' as const, text: 'Переписка доступна только с подтверждёнными друзьями.' };
  }
  return null;
}

export function formatMessageTime(value: string, showDate = false) {
  const date = new Date(value);
  const now = new Date();
  const format: Intl.DateTimeFormatOptions = showDate && date.toDateString() !== now.toDateString()
    ? { day: 'numeric', month: 'short' }
    : { hour: '2-digit', minute: '2-digit' };
  return date.toLocaleString('ru-RU', format);
}
