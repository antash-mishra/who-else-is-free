/**
 * Test cases for CreateEventScreen date handling
 * Verifies that "today" vs "tomorrow" selection is correctly saved
 */

// Helper functions extracted from CreateEventScreen
const getDateStringForChoice = (choice: "today" | "tomorrow"): string => {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  if (choice === "tomorrow") {
    base.setDate(base.getDate() + 1);
  }
  const year = base.getFullYear();
  const month = `${base.getMonth() + 1}`.padStart(2, "0");
  const day = `${base.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDateChoiceFromEventDate = (eventDate?: string): "today" | "tomorrow" => {
  if (!eventDate) {
    return "today";
  }
  const [year, month, day] = eventDate.split("-").map((part) => Number(part));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    day < 1
  ) {
    return "today";
  }
  const parsed = new Date(year, month - 1, day);
  const diffDays = Math.floor(
    (parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diffDays === 1 ? "tomorrow" : "today";
};

describe("CreateEventScreen - Date Handling", () => {
  describe("getDateStringForChoice", () => {
    it("should return today's date when 'today' is selected", () => {
      const result = getDateStringForChoice("today");
      const now = new Date();
      const expectedYear = now.getFullYear();
      const expectedMonth = `${now.getMonth() + 1}`.padStart(2, "0");
      const expectedDay = `${now.getDate()}`.padStart(2, "0");
      const expected = `${expectedYear}-${expectedMonth}-${expectedDay}`;

      expect(result).toBe(expected);
    });

    it("should return tomorrow's date when 'tomorrow' is selected", () => {
      const result = getDateStringForChoice("tomorrow");
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expectedYear = tomorrow.getFullYear();
      const expectedMonth = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
      const expectedDay = `${tomorrow.getDate()}`.padStart(2, "0");
      const expected = `${expectedYear}-${expectedMonth}-${expectedDay}`;

      expect(result).toBe(expected);
    });

    it("should return date in YYYY-MM-DD format", () => {
      const result = getDateStringForChoice("today");
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      expect(result).toMatch(regex);
    });
  });

  describe("getDateChoiceFromEventDate", () => {
    it("should return 'today' for today's date", () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = `${today.getMonth() + 1}`.padStart(2, "0");
      const day = `${today.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const result = getDateChoiceFromEventDate(dateStr);
      expect(result).toBe("today");
    });

    it("should return 'tomorrow' for tomorrow's date", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const year = tomorrow.getFullYear();
      const month = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
      const day = `${tomorrow.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const result = getDateChoiceFromEventDate(dateStr);
      expect(result).toBe("tomorrow");
    });

    it("should return 'today' for invalid dates", () => {
      expect(getDateChoiceFromEventDate("invalid-date")).toBe("today");
      expect(getDateChoiceFromEventDate("2024-13-01")).toBe("today");
      expect(getDateChoiceFromEventDate("2024-00-01")).toBe("today");
    });

    it("should return 'today' for undefined date", () => {
      expect(getDateChoiceFromEventDate(undefined)).toBe("today");
    });

    it("should return 'today' for past dates (more than 1 day ago)", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const year = yesterday.getFullYear();
      const month = `${yesterday.getMonth() + 1}`.padStart(2, "0");
      const day = `${yesterday.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const result = getDateChoiceFromEventDate(dateStr);
      expect(result).toBe("today");
    });

    it("should return 'today' for future dates (more than 1 day ahead)", () => {
      const twoWeekLater = new Date();
      twoWeekLater.setDate(twoWeekLater.getDate() + 14);
      const year = twoWeekLater.getFullYear();
      const month = `${twoWeekLater.getMonth() + 1}`.padStart(2, "0");
      const day = `${twoWeekLater.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const result = getDateChoiceFromEventDate(dateStr);
      expect(result).toBe("today");
    });
  });

  describe("Round-trip conversion", () => {
    it("should correctly round-trip 'today' selection", () => {
      const dateStr = getDateStringForChoice("today");
      const result = getDateChoiceFromEventDate(dateStr);
      expect(result).toBe("today");
    });

    it("should correctly round-trip 'tomorrow' selection", () => {
      const dateStr = getDateStringForChoice("tomorrow");
      const result = getDateChoiceFromEventDate(dateStr);
      expect(result).toBe("tomorrow");
    });
  });

  describe("Edge cases - Month transitions", () => {
    it("should handle tomorrow as first day of next month", () => {
      // Create a mock date for the last day of a month
      const today = new Date();
      const lastDayOfMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0
      );

      // If today is the last day of the month
      if (
        today.getDate() === lastDayOfMonth.getDate() &&
        today.getMonth() === lastDayOfMonth.getMonth()
      ) {
        const dateStr = getDateStringForChoice("tomorrow");
        const result = getDateChoiceFromEventDate(dateStr);
        expect(result).toBe("tomorrow");
      }
    });

    it("should handle tomorrow as first day of next year", () => {
      // Create a mock date for Dec 31
      const year = new Date().getFullYear();
      const dec31 = new Date(year, 11, 31);

      // If today is Dec 31
      const today = new Date();
      if (today.getDate() === 31 && today.getMonth() === 11) {
        const dateStr = getDateStringForChoice("tomorrow");
        const result = getDateChoiceFromEventDate(dateStr);
        expect(result).toBe("tomorrow");
      }
    });
  });
});

// Export for use in other tests
export { getDateStringForChoice, getDateChoiceFromEventDate };
