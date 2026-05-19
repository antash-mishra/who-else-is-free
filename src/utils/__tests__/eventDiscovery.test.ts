import {
  bucketEventsByDistance,
  LOCAL_RADIUS_KM,
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

  it("keeps only nearby events and ignores far or missing-distance events", () => {
    const buckets = bucketEventsByDistance(
      withEventDistances(events, viewerLocation),
    );

    expect(buckets.nearby.map((event) => event.id)).toEqual(["near"]);
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
