export type MapPoint = { id: string; name: string; latitude: number; longitude: number; postId?: string | null; kind?: 'person'; updatedAt?: number; reviewStatus?: 'private' | 'pending' | 'approved'; isOwn?: number };
export type MapState = { places: MapPoint[]; people: MapPoint[]; selected: { latitude: number; longitude: number } | null; center: { latitude: number; longitude: number; sequence: number } | null };
export type MapCanvasProps = { state: MapState; onSelect: (latitude: number, longitude: number) => void; onError: (message: string) => void; onSubmit: (id: string) => void };
