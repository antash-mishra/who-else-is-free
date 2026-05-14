import {
  bucketEventsByDistance,
  LOCAL_RADIUS_KM,
  LOCAL_MIN_RESULTS,
  shouldShowFartherFallback,
  sortByDistance,
  withEventDistances,
} from "@utils/eventDiscovery";

describe("event discovery utilities", () => {
  const viewerLocation = { latitude: 12.9716, longitude: 77.5946 };
  const events = [
    { id: "near", latitude: 12.975, longitude: 77.6 },
    { id: "far", latitude: 53.3498, longitude: -6.2603 },
    { id: "unknown" },
  ];

  it("adds known and unknown distance values", () => {
    const withDistances = withEventDistances(events, viewerLocation);

    expect(withDistances.find((event) => event.id === "near")?.distanceKm).not.toBeNull();
    expect(withDistances.find((event) => event.id === "far")?.distanceKm).not.toBeNull();
    expect(withDistances.find((event) => event.id === "unknown")?.distanceKm).toBeNull();
  });

  it("uses a 50 km local radius", () => {
    expect(LOCAL_RADIUS_KM).toBe(50);
  });

  it("groups nearby and farther events while ignoring missing-distance events", () => {
    const buckets = bucketEventsByDistance(
      withEventDistances(events, viewerLocation),
    );

    expect(buckets.nearby.map((event) => event.id)).toEqual(["near"]);
    expect(buckets.farther.map((event) => event.id)).toEqual(["far"]);
  });

  it("only enables farther fallback when nearby event count is below threshold", () => {
    const nearby = Array.from({ length: LOCAL_MIN_RESULTS }, (_, index) => ({
      id: String(index),
      distanceKm: 1,
    }));

    expect(shouldShowFartherFallback(nearby)).toBe(false);
    expect(shouldShowFartherFallback(nearby.slice(1))).toBe(true);
  });

  it("sorts known-distance events first from nearest to farthest", () => {
    const sorted = [
      { id: "unknown", distanceKm: null },
      { id: "far", distanceKm: 100 },
      { id: "near", distanceKm: 2 },
    ].sort(sortByDistance);

    expect(sorted.map((event) => event.id)).toEqual(["near", "far", "unknown"]);
  });
});
