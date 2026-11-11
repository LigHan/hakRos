import type { MapCoordinates, MapPlace, MapPoint } from '../components/MapCanvas.types';

const nearbyRadiusMeters = 300;
const earthRadiusMeters = 6_371_000;
const radians = (degrees: number) => degrees * Math.PI / 180;

function distanceMeters(from: MapCoordinates, to: MapCoordinates) {
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const haversine = Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function highlightNearbySubscriptions(places: MapPlace[], position: MapCoordinates | null): MapPoint[] {
  if (!position) return places;
  return places.map(place => place.isSubscribed && distanceMeters(position, place) <= nearbyRadiusMeters
    ? { ...place, nearbySubscription: true }
    : place);
}
