import {
  Coordinates,
  getEventDistanceKm,
} from "@utils/distance";

export const LOCAL_RADIUS_KM = 50;

type EventWithCoordinates = {
  latitude?: number | null;
  longitude?: number | null;
};

export type EventWithDistance<T> = T & {
  distanceKm: number | null;
};

export type DistanceBuckets<T> = {
  nearby: EventWithDistance<T>[];
};

export const withEventDistances = <T extends EventWithCoordinates>(
  events: T[],
  viewerLocation?: Coordinates | null,
): EventWithDistance<T>[] =>
  events.map((event) => ({
    ...event,
    distanceKm: getEventDistanceKm(event, viewerLocation),
  }));

export const bucketEventsByDistance = <T>(
  events: EventWithDistance<T>[],
  localRadiusKm = LOCAL_RADIUS_KM,
): DistanceBuckets<T> =>
  events.reduce<DistanceBuckets<T>>(
    (buckets, event) => {
      if (event.distanceKm == null) {
        return buckets;
      }

      if (event.distanceKm <= localRadiusKm) {
        buckets.nearby.push(event);
      }
      return buckets;
    },
    { nearby: [] },
  );

export const sortByDistance = <T>(
  left: EventWithDistance<T>,
  right: EventWithDistance<T>,
) => {
  if (left.distanceKm == null && right.distanceKm == null) {
    return 0;
  }
  if (left.distanceKm == null) {
    return 1;
  }
  if (right.distanceKm == null) {
    return -1;
  }
  return left.distanceKm - right.distanceKm;
};
