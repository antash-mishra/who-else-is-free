export type Coordinates = {
  latitude: number;
  longitude: number;
};

type EventCoordinates = {
  latitude?: number | null;
  longitude?: number | null;
};

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const calculateDistanceKm = (
  from: Coordinates,
  to: Coordinates,
): number => {
  const latDelta = toRadians(to.latitude - from.latitude);
  const lngDelta = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);

  const haversine =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);

  return (
    EARTH_RADIUS_KM *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
};

export const getEventDistanceKm = (
  event: EventCoordinates,
  viewerLocation?: Coordinates | null,
): number | null => {
  if (
    !viewerLocation ||
    event.latitude == null ||
    event.longitude == null
  ) {
    return null;
  }

  return calculateDistanceKm(viewerLocation, {
    latitude: event.latitude,
    longitude: event.longitude,
  });
};
