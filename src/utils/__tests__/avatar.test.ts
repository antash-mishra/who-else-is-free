import {
  getAvatarColor,
  getAvatarInitials,
  resolveAvatarUri,
} from "../avatar";

describe("avatar utils", () => {
  describe("resolveAvatarUri", () => {
    it("returns null for empty values", () => {
      expect(resolveAvatarUri(undefined)).toBeNull();
      expect(resolveAvatarUri("")).toBeNull();
      expect(resolveAvatarUri("   ")).toBeNull();
    });

    it("keeps fully-qualified avatar URIs intact", () => {
      expect(resolveAvatarUri("https://example.com/avatar.png")).toBe(
        "https://example.com/avatar.png",
      );
      expect(resolveAvatarUri("data:image/png;base64,abc123")).toBe(
        "data:image/png;base64,abc123",
      );
    });

    it("converts raw base64 strings into data URIs", () => {
      expect(resolveAvatarUri("abc123")).toBe("data:image/jpeg;base64,abc123");
    });
  });

  describe("getAvatarInitials", () => {
    it("returns a single fallback initial by default", () => {
      expect(getAvatarInitials("Ada Lovelace")).toBe("A");
    });

    it("supports multiple initials when requested", () => {
      expect(getAvatarInitials("Ada Lovelace", 2)).toBe("AL");
    });

    it("returns a question mark for missing names", () => {
      expect(getAvatarInitials("")).toBe("?");
      expect(getAvatarInitials(undefined)).toBe("?");
    });
  });

  describe("getAvatarColor", () => {
    it("is stable for the same seed", () => {
      expect(getAvatarColor(42)).toBe(getAvatarColor(42));
      expect(getAvatarColor("Ada")).toBe(getAvatarColor("Ada"));
    });

    it("falls back to the name when no explicit seed is provided", () => {
      expect(getAvatarColor(undefined, "Ada")).toBe(getAvatarColor(undefined, "Ada"));
    });
  });
});
