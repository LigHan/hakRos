import { authorized } from '@/lib/statistics';

export type Person = { id: string; name: string };

export type PlaceSubscription = {
  placeId: string;
  name: string;
  handle: string;
  avatar: string;
  description: string;
};

export type Connections = {
  userId: string;
  friends: Person[];
  incomingRequests: Person[];
  outgoingRequests: Person[];
  subscriptions: PlaceSubscription[];
};

const path = '/api/connections';

export function getConnections(signal?: AbortSignal): Promise<Connections> {
  return authorized(path, { signal });
}

export function findPeople(query: string): Promise<Person[]> {
  return authorized(`${path}/users?q=${encodeURIComponent(query)}`);
}

export function updateFriend(userId: string, action: 'request' | 'accept' | 'remove'): Promise<{ ok: true }> {
  const friendPath = `${path}/friends/${encodeURIComponent(userId)}`;
  return action === 'remove'
    ? authorized(friendPath, { method: 'DELETE' })
    : authorized(`${friendPath}/${action}`, { method: 'PUT' });
}

export function getPlaceSubscription(placeId: string, signal?: AbortSignal): Promise<{ subscribed: boolean }> {
  return authorized(`${path}/places/${encodeURIComponent(placeId)}`, { signal });
}

export function setPlaceSubscription(placeId: string, subscribed: boolean): Promise<{ subscribed: boolean }> {
  return authorized(`${path}/places/${encodeURIComponent(placeId)}`, {
    method: subscribed ? 'PUT' : 'DELETE',
  });
}
