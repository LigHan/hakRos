import { authorized } from '@/lib/statistics';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type LeisurePlan = {
  id: string; ownerId: string; ownerName: string; placeId: string; placeName: string | null; address: string | null;
  image: string | null; startsAt: string; timeZone: string; durationMinutes: number | null; comment: string;
  status: 'active' | 'cancelled'; createdAt: string; updatedAt: string; revision: number; invitationStatus: InvitationStatus | null;
  participants?: { id: string; name: string; status: InvitationStatus }[];
};
export type PlanInput = { placeId: string; startsAt: string; timeZone: string; durationMinutes: number | null; comment: string; confirmed: true };
const base = '/api/plans';
const idPath = (id: string) => `${base}/${encodeURIComponent(id)}`;

export const listPlans = (): Promise<LeisurePlan[]> => authorized(base);
export const getPlan = (id: string): Promise<LeisurePlan> => authorized(idPath(id));
export const createPlan = (input: PlanInput, requestId: string): Promise<LeisurePlan> => authorized(base, { method: 'POST', body: JSON.stringify({ ...input, requestId }) });
export const updatePlan = (id: string, input: PlanInput, revision: number): Promise<LeisurePlan> => authorized(idPath(id), { method: 'PUT', body: JSON.stringify({ ...input, revision }) });
export const cancelPlan = (id: string): Promise<{ ok: true }> => authorized(`${idPath(id)}/cancel`, { method: 'POST', body: JSON.stringify({ confirmed: true }) });
export const inviteFriend = (id: string, friendId: string, revision: number): Promise<{ id: string; status: InvitationStatus }> => authorized(`${idPath(id)}/invitations`, { method: 'POST', body: JSON.stringify({ friendId, revision, confirmed: true }) });
export const respondInvitation = (id: string, status: 'accepted' | 'declined', revision: number): Promise<{ ok: true }> => authorized(`${idPath(id)}/respond`, { method: 'POST', body: JSON.stringify({ status, revision, confirmed: true }) });
export const cancelInvitation = (id: string, friendId: string): Promise<{ ok: true }> => authorized(`${idPath(id)}/invitations/${encodeURIComponent(friendId)}/cancel`, { method: 'POST', body: JSON.stringify({ confirmed: true }) });

export function formatPlanDate(value: string, timeZone: string) {
  try { return `${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone }).format(new Date(value))} · ${timeZone}`; }
  catch { return value; }
}
