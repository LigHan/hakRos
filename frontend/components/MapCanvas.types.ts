export type MapCoordinates = { latitude: number; longitude: number };
export type MapPoint = MapCoordinates & {
  id: string;
  name: string;
  postId?: string | null;
  category?: string | null;
  address?: string | null;
  image?: string | null;
  avatar?: string | null;
  kind?: 'person';
  updatedAt?: number;
  reviewStatus?: 'private' | 'pending' | 'approved';
  isOwn?: number;
  nearbySubscription?: boolean;
};

export type MapPlace = MapPoint & { isSubscribed: boolean };

export type MapState = {
  places: MapPoint[];
  people: MapPoint[];
  selected: MapCoordinates | null;
  center: (MapCoordinates & { sequence: number }) | null;
  destination: (MapCoordinates & { title: string; pointId?: string }) | null;
  routeStart: MapCoordinates | null;
  route: { coordinates: [number, number][]; sequence: number } | null;
};

export type MapCanvasProps = {
  state: MapState;
  onSelect: (latitude: number, longitude: number) => void;
  onError: (message: string) => void;
  onSubmit?: (id: string) => void;
  onOpenPlace?: (id: string) => void;
};
