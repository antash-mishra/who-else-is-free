import {
  calculateDistanceKm,
  getEventDistanceKm,
} from "@utils/distance";

describe("distance utilities", () => {
  const bangalore = { latitude: 12.9716, longitude: 77.5946 };
  const dublin = { latitude: 53.3498, longitude: -6.2603 };

  it("calculates rough haversine distance between coordinates", () => {
    const distance = calculateDistanceKm(bangalore, dublin);

    expect(distance).toBeGreaterThan(8000);
    expect(distance).toBeLessThan(9000);
  });

  it("returns zero for the same coordinate", () => {
    expect(calculateDistanceKm(bangalore, bangalore)).toBeCloseTo(0);
  });

  it("returns null when viewer location is missing", () => {
    expect(
      getEventDistanceKm(
        { latitude: bangalore.latitude, longitude: bangalore.longitude },
        null,
      ),
    ).toBeNull();
  });

  it("returns null when event coordinates are missing", () => {
    expect(getEventDistanceKm({ latitude: bangalore.latitude }, bangalore)).toBeNull();
    expect(getEventDistanceKm({ longitude: bangalore.longitude }, bangalore)).toBeNull();
  });
});
