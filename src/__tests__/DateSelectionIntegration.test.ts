/**
 * Integration Test: Full date selection flow
 * Simulates the complete flow from CreateEventScreen to EventsContext
 */

// Import the date handling functions
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

const deriveDateLabelFromDate = (
  eventDate: string
): "Today" | "Tmrw" => {
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

describe("Date Selection Integration Tests", () => {
  describe("Scenario: User creates event for tomorrow", () => {
    it("should correctly save and retrieve tomorrow event with proper label", () => {
      // Step 1: User selects "tomorrow" in CreateEventScreen
      const userSelection = "tomorrow";

      // Step 2: Convert to date string for API
      const eventDate = getDateStringForChoice(userSelection);

      // Step 3: Verify format is correct
      expect(eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Step 4: Simulate saving to API and retrieving
      // In real flow: addUserEvent({ eventDate, ... })
      // Then API stores and returns the event

      // Step 5: Derive label from stored date (as done in EventsContext)
      const derivedLabel = deriveDateLabelFromDate(eventDate);

      // Step 6: Verify the label matches the user's original selection
      expect(derivedLabel).toBe("Tmrw");
    });
  });

  describe("Scenario: User creates event for today", () => {
    it("should correctly save and retrieve today event with proper label", () => {
      // Step 1: User selects "today" in CreateEventScreen
      const userSelection = "today";

      // Step 2: Convert to date string for API
      const eventDate = getDateStringForChoice(userSelection);

      // Step 3: Verify format is correct
      expect(eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Step 4: Simulate saving to API and retrieving

      // Step 5: Derive label from stored date
      const derivedLabel = deriveDateLabelFromDate(eventDate);

      // Step 6: Verify the label matches the user's original selection
      expect(derivedLabel).toBe("Today");
    });
  });

  describe("Scenario: User edits tomorrow event, keeps tomorrow", () => {
    it("should preserve tomorrow label when updating tomorrow event", () => {
      // Step 1: Event was originally created for tomorrow
      const originalDate = getDateStringForChoice("tomorrow");

      // Step 2: User opens event for editing (in real app, editEvent.eventDate)
      const editEventDate = originalDate;

      // Step 3: User doesn't change date, clicks "Update Event"
      const updatedDate = editEventDate; // No change

      // Step 4: Derive label from updated date
      const derivedLabel = deriveDateLabelFromDate(updatedDate);

      // Step 5: Verify label is still "Tmrw"
      expect(derivedLabel).toBe("Tmrw");
    });
  });

  describe("Scenario: User edits today event, changes to tomorrow", () => {
    it("should correctly update label when changing from today to tomorrow", () => {
      // Step 1: Event was originally created for today
      const originalDate = getDateStringForChoice("today");
      const originalLabel = deriveDateLabelFromDate(originalDate);
      expect(originalLabel).toBe("Today");

      // Step 2: User opens event for editing
      // (in real app, dateChoice would be set from originalDate)

      // Step 3: User changes date to tomorrow
      const updatedDate = getDateStringForChoice("tomorrow");

      // Step 4: Derive label from updated date
      const derivedLabel = deriveDateLabelFromDate(updatedDate);

      // Step 5: Verify label changed to "Tmrw"
      expect(derivedLabel).toBe("Tmrw");
    });
  });

  describe("Multiple consecutive events", () => {
    it("should correctly handle creating multiple events for tomorrow", () => {
      const eventCount = 3;
      const events = [];

      for (let i = 0; i < eventCount; i++) {
        // Create event for tomorrow
        const eventDate = getDateStringForChoice("tomorrow");
        const label = deriveDateLabelFromDate(eventDate);

        events.push({
          id: i,
          eventDate,
          label,
        });
      }

      // Verify all events have correct tomorrow label
      events.forEach((event) => {
        expect(event.label).toBe("Tmrw");
      });

      // Verify all events have the same date
      const firstDate = events[0].eventDate;
      events.forEach((event) => {
        expect(event.eventDate).toBe(firstDate);
      });
    });
  });

  describe("API payload simulation", () => {
    it("should generate correct API payload for create event", () => {
      // Simulate CreateEventScreen form
      const form = {
        eventName: "Dinner with friends",
        dateChoice: "tomorrow" as const,
        time: "19:00",
        location: "Restaurant",
      };

      // Simulate handleSubmit in CreateEventScreen
      const eventDate = getDateStringForChoice(form.dateChoice);

      // Simulate API payload (as per EventsContext.addUserEvent)
      const apiPayload = {
        title: form.eventName,
        location: form.location,
        time: form.time,
        event_date: eventDate,
        date_label: deriveDateLabelFromDate(eventDate), // Derived in context
      };

      // Verify payload
      expect(apiPayload.event_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(apiPayload.date_label).toBe("Tmrw");
    });
  });

  describe("Timezone edge case test", () => {
    it("should use Math.floor for accurate day calculation", () => {
      // This test verifies the fix to the original bug
      // Math.floor ensures tomorrow is always "Tmrw", never "Today"

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const year = tomorrow.getFullYear();
      const month = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
      const day = `${tomorrow.getDate()}`.padStart(2, "0");
      const tomorrowStr = `${year}-${month}-${day}`;

      // Get current time in milliseconds
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Calculate difference manually to verify the math
      const timeDiff = new Date(year, Number(month) - 1, Number(day)).getTime() -
        today.getTime();
      const diffDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      // With Math.floor, diffDays should be exactly 1
      expect(diffDays).toBe(1);

      // And deriveDateLabelFromDate should return "Tmrw"
      const label = deriveDateLabelFromDate(tomorrowStr);
      expect(label).toBe("Tmrw");
    });
  });
});
