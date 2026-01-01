import { DateOption } from "@constants/eventOptions";

// Base time options for event scheduling
export const baseTimeOptions = [
    "7:00pm",
    "7:30pm",
    "8:00pm",
    "8:30pm",
    "9:00pm",
    "9:30pm",
    "10:00pm",
];

/**
 * Convert a time label string (e.g., "7:30pm", "19:30") to total minutes from midnight.
 * Returns null if the format is invalid.
 */
export const timeStringToMinutes = (timeLabel: string): number | null => {
    const match = timeLabel
        .trim()
        .toLowerCase()
        .match(/(\d{1,2}):(\d{2})(am|pm)?/);
    if (!match) {
        return null;
    }
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridiem = match[3];

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return null;
    }

    if (meridiem) {
        if (meridiem === "pm" && hours !== 12) {
            hours += 12;
        }
        if (meridiem === "am" && hours === 12) {
            hours = 0;
        }
    }

    return hours * 60 + minutes;
};

/**
 * Format total minutes from midnight to HH:MM format (24-hour).
 */
export const formatMinutesToTime = (minutes: number): string => {
    const h = Math.max(0, Math.min(23, Math.floor(minutes / 60)));
    const m = Math.max(0, Math.min(59, minutes % 60));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * Parse a time string (HH:MM or with am/pm) into hour and minute components.
 */
export const parseTimeString = (
    timeStr: string,
): { hour: number; minute: number } => {
    const minutes = timeStringToMinutes(timeStr);
    if (minutes == null) {
        return { hour: 0, minute: 0 };
    }
    const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
    return { hour: Math.floor(clamped / 60), minute: clamped % 60 };
};

/**
 * Get YYYY-MM-DD string for "today" or "tomorrow" choice.
 */
export const getDateStringForChoice = (choice: DateOption): string => {
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

/**
 * Build ISO 8601 UTC timestamp from local date choice and time (HH:MM format).
 */
export const buildScheduledAtUTC = (
    dateChoice: DateOption,
    time: string,
): string => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    if (dateChoice === "tomorrow") {
        base.setDate(base.getDate() + 1);
    }

    // Parse time (HH:MM format)
    const timeParts = time.split(":");
    const hours = parseInt(timeParts[0], 10) || 0;
    const minutes = parseInt(timeParts[1], 10) || 0;

    // Set the time in local timezone
    base.setHours(hours, minutes, 0, 0);

    // Return as ISO 8601 UTC string
    return base.toISOString();
};

/**
 * Determine if an event date string corresponds to "today" or "tomorrow".
 */
export const getDateChoiceFromEventDate = (eventDate?: string): DateOption => {
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
        (parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diffDays === 1 ? "tomorrow" : "today";
};

/**
 * Compute the next available time slot for a given date choice.
 * Returns null if no valid time slot is available (e.g., all times have passed for today).
 */
export const computeNextAvailableTime = (choice: DateOption): string | null => {
    const now = new Date();
    const currentMinutes =
        choice === "today" ? now.getHours() * 60 + now.getMinutes() : -1;
    const next = baseTimeOptions.find((label) => {
        const minutes = timeStringToMinutes(label);
        if (minutes == null) {
            return false;
        }
        return currentMinutes === -1 || minutes > currentMinutes;
    });
    if (!next) {
        return null;
    }
    const minutes = timeStringToMinutes(next);
    return minutes != null ? formatMinutesToTime(minutes) : null;
};

/**
 * Check if a time selection is in the past for today's events.
 */
export const isPastTimeSelection = (
    choice: DateOption,
    timeValue: string,
): boolean => {
    if (choice !== "today") {
        return false;
    }
    const minutes = timeStringToMinutes(timeValue);
    if (minutes == null) {
        return true;
    }
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return minutes <= nowMinutes;
};

/**
 * Format hour and minute into HH:MM string.
 */
export const formatTime = (hour: number, minute: number): string => {
    const h = Math.max(0, Math.min(23, hour));
    const m = Math.max(0, Math.min(59, minute));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
