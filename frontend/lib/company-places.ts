import type { MapCoordinates } from '@/components/MapCanvas.types';
import { withPlaceCoverUrl, type Post, type WorkingHours } from '@/constants/content';
import { authorized } from '@/lib/statistics';

export type CompanyPlaceFields = {
  place: string;
  address: string;
  bio: string;
  category: string;
  coordinates?: MapCoordinates | null;
  image?: string;
  coverBase64?: string;
  workingHours: WorkingHours[];
};

export type CompanyPlace = Post & { coordinates: MapCoordinates | null };

const path = '/api/company/places';

export async function getCompanyPlaces(signal?: AbortSignal): Promise<CompanyPlace[]> {
  const places: CompanyPlace[] = await authorized(path, { signal });
  return places.map(withPlaceCoverUrl);
}

export async function createCompanyPlace(fields: CompanyPlaceFields, requestId: string, signal?: AbortSignal): Promise<CompanyPlace> {
  return withPlaceCoverUrl(await authorized(path, { method: 'POST', signal, body: JSON.stringify({ ...fields, requestId }) }));
}

export async function updateCompanyPlace(id: string, fields: CompanyPlaceFields, signal?: AbortSignal): Promise<CompanyPlace> {
  return withPlaceCoverUrl(await authorized(`${path}/${encodeURIComponent(id)}`, { method: 'PUT', signal, body: JSON.stringify(fields) }));
}
