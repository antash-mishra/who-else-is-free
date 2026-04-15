import { DateOption } from "@constants/eventOptions";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TIME_STRING_PATTERN = /^(\d{1,2}):(\d{2})(?:\s?(am|pm))?$/i;

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
    const match = timeLabel.trim().match(TIME_STRING_PATTERN);
    if (!match) {
        return null;
    }
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridiem = match[3]?.toLowerCase();

    if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes) ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }

    if (meridiem) {
        if (hours < 1 || hours > 12) {
            return null;
        }
        if (meridiem === "pm" && hours !== 12) {
            hours += 12;
        }
        if (meridiem === "am" && hours === 12) {
            hours = 0;
        }
    } else if (hours < 0 || hours > 23) {
        return null;
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
 * Format hour and minute into 12-hour AM/PM string (e.g. "7:30 PM").
 */
export const formatTimeAmPm = (hour: number, minute: number): string => {
    const h = Math.max(0, Math.min(23, hour));
    const m = Math.max(0, Math.min(59, minute));
    const period = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 || 12;
    return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
};

/**
 * Convert an HH:MM (24-hour) time string to 12-hour AM/PM format (e.g. "7:30 PM").
 * Returns the original string if it cannot be parsed.
 */
export const convertTo12Hour = (timeStr: string): string => {
    const minutes = timeStringToMinutes(timeStr);
    if (minutes == null) {
        return timeStr;
    }
    return formatTimeAmPm(Math.floor(minutes / 60), minutes % 60);
};

export interface ScheduleDisplayInput {
    scheduledAt?: string | null;
    eventDate?: string | null;
    time?: string | null;
    dateLabel?: string | null;
}

export interface ScheduleDisplay {
    displayDate: string;
    displayTime: string;
    displayLabel: string;
}

export const getScheduleDisplay = ({
    scheduledAt,
    eventDate,
    time,
    dateLabel,
}: ScheduleDisplayInput): ScheduleDisplay => {
    const trimmedDate = eventDate?.trim() ?? "";
    const trimmedTime = time?.trim() ?? "";
    const trimmedLabel = dateLabel?.trim() ?? "";

    if (scheduledAt) {
        const scheduledDate = new Date(scheduledAt);
        if (!Number.isNaN(scheduledDate.getTime())) {
            const displayDate = toDateKey(scheduledDate);
            return {
                displayDate,
                displayTime: formatTimeAmPm(
                    scheduledDate.getHours(),
                    scheduledDate.getMinutes(),
                ),
                displayLabel: getLegacyDateLabel(displayDate),
            };
        }
    }

    return {
        displayDate: trimmedDate,
        displayTime: convertTo12Hour(trimmedTime),
        displayLabel: trimmedDate
            ? getLegacyDateLabel(trimmedDate)
            : trimmedLabel,
    };
};

/**
 * Format hour and minute into HH:MM string.
 */
export const formatTime = (hour: number, minute: number): string => {
    const h = Math.max(0, Math.min(23, hour));
    const m = Math.max(0, Math.min(59, minute));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const toDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export const parseDateKey = (eventDate: string): Date | null => {
    const [year, month, day] = eventDate
        .split("-")
        .map((part) => Number(part));
    if (
        Number.isNaN(year) ||
        Number.isNaN(month) ||
        Number.isNaN(day) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return null;
    }

    const parsed = new Date(year, month - 1, day);
    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) {
        return null;
    }

    return parsed;
};

export const combineDateAndTime = (eventDate: string, time: string): Date | null => {
    const parsedDate = parseDateKey(eventDate);
    const parsedTime = parseTimeString(time);
    if (!parsedDate) {
        return null;
    }

    const next = new Date(parsedDate);
    next.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
    return next;
};

export const formatAbsoluteDateLabel = (eventDate: string): string => {
    const parsed = parseDateKey(eventDate);
    if (!parsed) {
        return eventDate;
    }

    const day = `${parsed.getDate()}`.padStart(2, "0");
    const month = parsed.toLocaleString("en-US", { month: "short" });
    const weekday = parsed.toLocaleString("en-US", { weekday: "short" });
    return `${day} ${month} ${weekday}`;
};

const getLocaleRegion = (localeTag: string): string | null => {
    const normalized = localeTag.replace(/_/g, "-");
    const parts = normalized.split("-");
    for (const part of parts.slice(1)) {
        if (/^[a-z]{2}$/i.test(part) || /^\d{3}$/.test(part)) {
            return part.toUpperCase();
        }
    }
    return null;
};

const getDeviceLocaleTag = (): string => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().locale ?? "";
    } catch {
        return "";
    }
};

export const isUSLocale = (localeTag?: string): boolean => {
    const effectiveLocale = localeTag ?? getDeviceLocaleTag();
    if (!effectiveLocale) {
        return false;
    }
    return getLocaleRegion(effectiveLocale) === "US";
};

export const formatEventDetailDateLabel = (
    eventDate: string,
    localeTag?: string,
): string => {
    const parsed = parseDateKey(eventDate);
    if (!parsed) {
        return eventDate;
    }

    const day = `${parsed.getDate()}`.padStart(2, "0");
    const month = parsed.toLocaleString("en-US", { month: "short" });
    const weekday = parsed.toLocaleString("en-US", { weekday: "short" });

    if (isUSLocale(localeTag)) {
        return `${weekday} ${day} ${month}`;
    }

    return `${day} ${month} ${weekday}`;
};

export const getPickerSectionDateLabel = (
    eventDate: string,
    now: Date = new Date(),
    localeTag?: string,
): string => {
    const diff = getDiffFromToday(eventDate, now);
    if (diff === 0) {
        return "Today";
    }
    if (diff === 1) {
        return "Tomorrow";
    }
    return formatEventDetailDateLabel(eventDate, localeTag);
};

const getDiffFromToday = (eventDate: string, now: Date = new Date()): number | null => {
    const parsed = parseDateKey(eventDate);
    if (!parsed) {
        return null;
    }

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());

    return Math.floor((eventDay.getTime() - today.getTime()) / ONE_DAY_MS);
};

export const getSectionDateLabel = (eventDate: string, now: Date = new Date()): string => {
    const diff = getDiffFromToday(eventDate, now);
    if (diff === 0) {
        return "Today";
    }
    if (diff === 1) {
        return "Tomorrow";
    }
    return formatAbsoluteDateLabel(eventDate);
};

export const getLegacyDateLabel = (eventDate: string, now: Date = new Date()): string => {
    const diff = getDiffFromToday(eventDate, now);
    if (diff === 0) {
        return "Today";
    }
    if (diff === 1) {
        return "Tmrw";
    }
    return formatAbsoluteDateLabel(eventDate);
};

const roundToMinuteStep = (date: Date, minuteStep: number): Date => {
    const next = new Date(date);
    const remainder = next.getMinutes() % minuteStep;
    if (remainder !== 0) {
        next.setMinutes(next.getMinutes() + (minuteStep - remainder));
    }
    next.setSeconds(0, 0);
    return next;
};

export const getDefaultEventDateTime = (now: Date = new Date()): Date => {
    const baseline = new Date(now.getTime() + 30 * 60 * 1000);
    return roundToMinuteStep(baseline, 5);
};

export const getMaxEventDateTime = (now: Date = new Date(), daysAhead = 30): Date => {
    const max = new Date(now);
    max.setDate(max.getDate() + daysAhead);
    return max;
};

export const clampDateTime = (value: Date, min: Date, max: Date): Date => {
    if (value.getTime() < min.getTime()) {
        return new Date(min);
    }
    if (value.getTime() > max.getTime()) {
        return new Date(max);
    }
    return value;
};

export const isPastDateTimeSelection = (value: Date, now: Date = new Date()): boolean =>
    value.getTime() <= now.getTime();

export const formatDateTimeValue = (value: Date): string => {
    const eventDate = toDateKey(value);
    const datePart = formatAbsoluteDateLabel(eventDate);
    const hours = value.getHours();
    const minutes = value.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    const m = String(minutes).padStart(2, "0");
    return `${datePart}, ${h}:${m} ${period}`;
};

export const formatPickerDateTimeValue = (
    value: Date,
    localeTag?: string,
): string => {
    const eventDate = toDateKey(value);
    const datePart = formatEventDetailDateLabel(eventDate, localeTag);
    const hours = value.getHours();
    const minutes = value.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    const m = String(minutes).padStart(2, "0");
    return `${datePart}, ${h}:${m} ${period}`;
};

/**
 * Get YYYY-MM-DD string for "today" or "tomorrow" choice.
 * @deprecated Prefer using toDateKey on concrete Date objects.
 */
export const getDateStringForChoice = (choice: DateOption): string => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    if (choice === "tomorrow") {
        base.setDate(base.getDate() + 1);
    }
    return toDateKey(base);
};

/**
 * Build ISO 8601 UTC timestamp from local date choice and time (HH:MM format).
 * @deprecated Prefer using Date#toISOString on concrete Date objects.
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

    const parsedTime = parseTimeString(time);
    base.setHours(parsedTime.hour, parsedTime.minute, 0, 0);

    return base.toISOString();
};

/**
 * Determine if an event date string corresponds to "today" or "tomorrow".
 * @deprecated Kept for backward compatibility with legacy tests.
 */
export const getDateChoiceFromEventDate = (eventDate?: string): DateOption => {
    if (!eventDate) {
        return "today";
    }
    const diff = getDiffFromToday(eventDate);
    return diff === 1 ? "tomorrow" : "today";
};

/**
 * Compute the next available time slot for a given date choice.
 * Returns null if no valid time slot is available (e.g., all times have passed for today).
 * @deprecated Used only by legacy CreateEvent flows.
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
 * @deprecated Prefer isPastDateTimeSelection with concrete Date values.
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
