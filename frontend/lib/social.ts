import { authorized } from '@/lib/statistics';

export type SocialItem = {
  id: string; kind: 'post' | 'story'; body: string; imageUrl: string | null;
  authorId: string; authorName: string; placeId: string | null; placeName: string | null;
  createdAt: string; expiresAt: string | null; originalId: string | null;
  originalBody: string | null; originalImageUrl: string | null; originalAuthorName: string | null;
  likes: number; liked: boolean; comments: number;
};
export type SocialComment = { id: string; body: string; authorName: string; createdAt: string };
export type NewSocialItem = { kind: 'post' | 'story'; body: string; imageUrl?: string | null; placeId?: string | null; originalId?: string | null; requestId: string };
export const socialRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const getSocialFeed = (): Promise<SocialItem[]> => authorized('/api/social/feed');
export const publishSocial = (item: NewSocialItem): Promise<SocialItem> => authorized('/api/social/items', { method: 'POST', body: JSON.stringify(item) });
export const setSocialLike = (id: string, liked: boolean): Promise<SocialItem> => authorized(`/api/social/items/${encodeURIComponent(id)}/like`, { method: liked ? 'PUT' : 'DELETE' });
export const getSocialComments = (id: string): Promise<SocialComment[]> => authorized(`/api/social/items/${encodeURIComponent(id)}/comments`);
export const addSocialComment = (id: string, body: string, requestId: string): Promise<{ ok: true }> => authorized(`/api/social/items/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify({ body, requestId }) });
