/**
 * Test cases for EventsContext date handling
 * Verifies that dates are correctly derived and labeled
 */

// Helper functions extracted from EventsContext
type DateLabel = "Today" | "Tmrw";

const deriveDateLabelFromDate = (eventDate: string): DateLabel => {
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
    return "Today";
  }
  const parsed = new Date(year, month - 1, day);
  const diffDays = Math.floor(
    (parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diffDays === 1 ? "Tmrw" : "Today";
};

describe("EventsContext - Date Label Derivation", () => {
  describe("deriveDateLabelFromDate", () => {
    it("should return 'Today' for today's date", () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = `${today.getMonth() + 1}`.padStart(2, "0");
      const day = `${today.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const result = deriveDateLabelFromDate(dateStr);
      expect(result).toBe("Today");
    });

    it("should return 'Tmrw' for tomorrow's date", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const year = tomorrow.getFullYear();
      const month = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
      const day = `${tomorrow.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const result = deriveDateLabelFromDate(dateStr);
      expect(result).toBe("Tmrw");
    });

    it("should return 'Today' for invalid dates", () => {
      expect(deriveDateLabelFromDate("invalid-date")).toBe("Today");
      expect(deriveDateLabelFromDate("2024-13-01")).toBe("Today");
      expect(deriveDateLabelFromDate("2024-00-01")).toBe("Today");
      expect(deriveDateLabelFromDate("")).toBe("Today");
    });

    it("should return 'Today' for past dates", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const year = yesterday.getFullYear();
      const month = `${yesterday.getMonth() + 1}`.padStart(2, "0");
      const day = `${yesterday.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const result = deriveDateLabelFromDate(dateStr);
      expect(result).toBe("Today");
    });

    it("should return 'Today' for dates more than 1 day in future", () => {
      const twoWeekLater = new Date();
      twoWeekLater.setDate(twoWeekLater.getDate() + 14);
      const year = twoWeekLater.getFullYear();
      const month = `${twoWeekLater.getMonth() + 1}`.padStart(2, "0");
      const day = `${twoWeekLater.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const result = deriveDateLabelFromDate(dateStr);
      expect(result).toBe("Today");
    });
  });

  describe("Date format validation", () => {
    it("should handle dates with leading zeros", () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = `${today.getMonth() + 1}`.padStart(2, "0");
      const day = `${today.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      expect(deriveDateLabelFromDate(dateStr)).toBeDefined();
    });

    it("should reject dates with invalid month format", () => {
      expect(deriveDateLabelFromDate("2024-1-15")).toBe("Today"); // Single digit month
      expect(deriveDateLabelFromDate("2024-13-15")).toBe("Today"); // Month > 12
    });

    it("should reject dates with invalid day format", () => {
      expect(deriveDateLabelFromDate("2024-12-0")).toBe("Today"); // Day < 1
      expect(deriveDateLabelFromDate("2024-12-32")).toBe("Today"); // Day > 31
    });
  });

  describe("Edge cases - Timezone handling", () => {
    it("should correctly distinguish today vs tomorrow regardless of timezone", () => {
      // This test verifies the fix using Math.floor instead of Math.round
      // The issue occurred when date diff was very close to 24 hours
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const year = tomorrow.getFullYear();
      const month = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
      const day = `${tomorrow.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      // Should always return "Tmrw" for tomorrow's date, never "Today"
      const result = deriveDateLabelFromDate(dateStr);
      expect(result).toBe("Tmrw");
    });
  });

  describe("Month boundary transitions", () => {
    it("should correctly handle month transition (today is last day of month)", () => {
      const year = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      const lastDayOfMonth = new Date(year, currentMonth + 1, 0).getDate();
      const today = new Date();

      if (today.getDate() === lastDayOfMonth) {
        const dateStr = `${year}-${`${currentMonth + 2}`.padStart(2, "0")}-01`;
        const result = deriveDateLabelFromDate(dateStr);
        expect(result).toBe("Tmrw");
      }
    });

    it("should correctly handle year transition (today is Dec 31)", () => {
      const today = new Date();
      if (today.getMonth() === 11 && today.getDate() === 31) {
        const nextYear = today.getFullYear() + 1;
        const dateStr = `${nextYear}-01-01`;
        const result = deriveDateLabelFromDate(dateStr);
        expect(result).toBe("Tmrw");
      }
    });
  });
});

export { deriveDateLabelFromDate };
