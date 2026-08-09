import {
  formatCompactRelativeTime,
  getNextCompactRelativeTimeUpdateMs,
} from "../relativeTime";

describe("relativeTime utilities", () => {
  const now = new Date("2026-05-11T12:00:00.000Z");

  describe("formatCompactRelativeTime", () => {
    it("returns now for timestamps newer than one minute", () => {
      expect(
        formatCompactRelativeTime(
          new Date(now.getTime() - 45 * 1000).toISOString(),
          now,
        ),
      ).toBe("Now");
    });

    it("returns compact minute labels for timestamps under one hour", () => {
      expect(
        formatCompactRelativeTime(
          new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
          now,
        ),
      ).toBe("2m");
      expect(
        formatCompactRelativeTime(
          new Date(now.getTime() - 59 * 60 * 1000).toISOString(),
          now,
        ),
      ).toBe("59m");
    });

    it("returns compact hour labels for timestamps under one day", () => {
      expect(
        formatCompactRelativeTime(
          new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          now,
        ),
      ).toBe("2h");
      expect(
        formatCompactRelativeTime(
          new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString(),
          now,
        ),
      ).toBe("10h");
    });

    it("returns compact day labels for older timestamps", () => {
      expect(
        formatCompactRelativeTime(
          new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          now,
        ),
      ).toBe("3d");
      expect(
        formatCompactRelativeTime(
          new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          now,
        ),
      ).toBe("10d");
    });

    it("returns empty string for invalid timestamps", () => {
      expect(formatCompactRelativeTime("not-a-date", now)).toBe("");
      expect(formatCompactRelativeTime(undefined, now)).toBe("");
    });
  });

  describe("getNextCompactRelativeTimeUpdateMs", () => {
    it("returns the remaining sub-minute delay for now labels", () => {
      expect(
        getNextCompactRelativeTimeUpdateMs(
          new Date(now.getTime() - 45 * 1000).toISOString(),
          now,
        ),
      ).toBe(15 * 1000);
    });

    it("returns the remaining minute boundary for minute labels", () => {
      expect(
        getNextCompactRelativeTimeUpdateMs(
          new Date(now.getTime() - (2 * 60 + 20) * 1000).toISOString(),
          now,
        ),
      ).toBe(40 * 1000);
    });

    it("returns the remaining hour boundary for hour labels", () => {
      expect(
        getNextCompactRelativeTimeUpdateMs(
          new Date(now.getTime() - (2 * 60 + 15) * 60 * 1000).toISOString(),
          now,
        ),
      ).toBe(45 * 60 * 1000);
    });

    it("returns the remaining day boundary for day labels", () => {
      expect(
        getNextCompactRelativeTimeUpdateMs(
          new Date(now.getTime() - (3 * 24 + 6) * 60 * 60 * 1000).toISOString(),
          now,
        ),
      ).toBe(18 * 60 * 60 * 1000);
    });

    it("returns null for invalid timestamps", () => {
      expect(getNextCompactRelativeTimeUpdateMs("not-a-date", now)).toBeNull();
      expect(getNextCompactRelativeTimeUpdateMs(undefined, now)).toBeNull();
    });
  });
});
