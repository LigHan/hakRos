import { API_URL, authorized } from '@/lib/statistics';
import { getUserSession, setUserSession } from '@/lib/user-session';

export type AccountProfile = {
  id: string;
  name: string;
  surname: string | null;
  role: 'user' | 'company';
  bio: string;
  avatar: string;
  isPrivate: boolean;
  canView?: boolean;
};

function normalize(profile: AccountProfile): AccountProfile {
  return { ...profile, avatar: profile.avatar.startsWith('/') ? API_URL + profile.avatar : profile.avatar };
}

export async function getAccountProfile(signal?: AbortSignal): Promise<AccountProfile> {
  return normalize(await authorized('/api/account/profile', { signal }));
}

export async function getPublicProfile(id: string, signal?: AbortSignal): Promise<AccountProfile> {
  return normalize(await authorized(`/api/profiles/${encodeURIComponent(id)}`, { signal }));
}

export async function updateAccountProfile(fields: { bio?: string; isPrivate?: boolean; avatarBase64?: string; removeAvatar?: boolean }): Promise<AccountProfile> {
  const profile = normalize(await authorized('/api/account/profile', { method: 'PATCH', body: JSON.stringify(fields) }));
  const session = await getUserSession();
  if (session && String(session.id) === profile.id) {
    await setUserSession({ ...session, bio: profile.bio, avatar: profile.avatar, isPrivate: profile.isPrivate });
  }
  return profile;
}
