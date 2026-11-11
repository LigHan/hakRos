import type { Post, WorkingHours } from '@/constants/content';
import { authorized } from '@/lib/statistics';

export type CompanyPlaceFields = {
  place: string;
  address: string;
  bio: string;
  category: string;
  image?: string;
  workingHours: WorkingHours[];
};

const path = '/api/company/places';

export function getCompanyPlaces(signal?: AbortSignal): Promise<Post[]> {
  return authorized(path, { signal });
}

export function createCompanyPlace(fields: CompanyPlaceFields, requestId: string, signal?: AbortSignal): Promise<Post> {
  return authorized(path, { method: 'POST', signal, body: JSON.stringify({ ...fields, requestId }) });
}

export function updateCompanyPlace(id: string, fields: CompanyPlaceFields, signal?: AbortSignal): Promise<Post> {
  return authorized(`${path}/${encodeURIComponent(id)}`, { method: 'PUT', signal, body: JSON.stringify(fields) });
}
