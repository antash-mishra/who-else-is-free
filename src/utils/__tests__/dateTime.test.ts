/**
 * Tests for dateTime utility functions
 * Covers time string parsing, formatting, and date/time calculations
 */

import {
  timeStringToMinutes,
  formatMinutesToTime,
  buildScheduledAtUTC,
  isPastTimeSelection,
  parseTimeString,
  formatTime,
  getDateStringForChoice,
} from '../dateTime';

describe('dateTime utilities', () => {
  describe('timeStringToMinutes', () => {
    it('should convert 12-hour time with pm to minutes', () => {
      expect(timeStringToMinutes('7:00pm')).toBe(19 * 60);
      expect(timeStringToMinutes('7:30pm')).toBe(19 * 60 + 30);
      expect(timeStringToMinutes('10:00pm')).toBe(22 * 60);
    });

    it('should convert 12-hour time with am to minutes', () => {
      expect(timeStringToMinutes('7:00am')).toBe(7 * 60);
      expect(timeStringToMinutes('9:30am')).toBe(9 * 60 + 30);
      expect(timeStringToMinutes('11:45am')).toBe(11 * 60 + 45);
    });

    it('should handle noon (12:00pm) correctly', () => {
      expect(timeStringToMinutes('12:00pm')).toBe(12 * 60);
      expect(timeStringToMinutes('12:30pm')).toBe(12 * 60 + 30);
    });

    it('should handle midnight (12:00am) correctly', () => {
      expect(timeStringToMinutes('12:00am')).toBe(0);
      expect(timeStringToMinutes('12:30am')).toBe(30);
    });

    it('should convert 24-hour time format to minutes', () => {
      expect(timeStringToMinutes('14:30')).toBe(14 * 60 + 30);
      expect(timeStringToMinutes('08:00')).toBe(8 * 60);
      expect(timeStringToMinutes('23:59')).toBe(23 * 60 + 59);
    });

    it('should handle time with leading/trailing whitespace', () => {
      expect(timeStringToMinutes('  7:30pm  ')).toBe(19 * 60 + 30);
      expect(timeStringToMinutes(' 14:00 ')).toBe(14 * 60);
    });

    it('should handle uppercase AM/PM', () => {
      expect(timeStringToMinutes('7:00PM')).toBe(19 * 60);
      expect(timeStringToMinutes('9:00AM')).toBe(9 * 60);
    });

    it('should return null for invalid formats', () => {
      expect(timeStringToMinutes('')).toBeNull();
      expect(timeStringToMinutes('invalid')).toBeNull();
      expect(timeStringToMinutes('7pm')).toBeNull();
      expect(timeStringToMinutes('25:00')).not.toBeNull(); // Note: doesn't validate range
    });
  });

  describe('formatMinutesToTime', () => {
    it('should format minutes to HH:MM 24-hour format', () => {
      expect(formatMinutesToTime(0)).toBe('00:00');
      expect(formatMinutesToTime(60)).toBe('01:00');
      expect(formatMinutesToTime(90)).toBe('01:30');
      expect(formatMinutesToTime(14 * 60 + 30)).toBe('14:30');
    });

    it('should handle edge cases at midnight', () => {
      expect(formatMinutesToTime(0)).toBe('00:00');
      expect(formatMinutesToTime(1)).toBe('00:01');
    });

    it('should handle edge cases at noon', () => {
      expect(formatMinutesToTime(12 * 60)).toBe('12:00');
      expect(formatMinutesToTime(12 * 60 + 30)).toBe('12:30');
    });

    it('should handle end of day', () => {
      expect(formatMinutesToTime(23 * 60 + 59)).toBe('23:59');
    });

    it('should clamp negative values to 00:00', () => {
      expect(formatMinutesToTime(-10)).toBe('00:00');
      expect(formatMinutesToTime(-1)).toBe('00:00');
    });

    it('should clamp values exceeding 23:59', () => {
      expect(formatMinutesToTime(24 * 60)).toBe('23:00');
      expect(formatMinutesToTime(30 * 60)).toBe('23:00');
    });
  });

  describe('buildScheduledAtUTC', () => {
    it('should build ISO UTC string for today', () => {
      const result = buildScheduledAtUTC('today', '14:30');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should build ISO UTC string for tomorrow', () => {
      const result = buildScheduledAtUTC('tomorrow', '19:00');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should handle midnight time', () => {
      const result = buildScheduledAtUTC('today', '00:00');
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle invalid time gracefully', () => {
      const result = buildScheduledAtUTC('today', 'invalid');
      expect(result).toBeDefined();
      // Should default to 00:00
    });
  });

  describe('isPastTimeSelection', () => {
    it('should return false for tomorrow regardless of time', () => {
      expect(isPastTimeSelection('tomorrow', '00:00')).toBe(false);
      expect(isPastTimeSelection('tomorrow', '23:59')).toBe(false);
      expect(isPastTimeSelection('tomorrow', '12:00pm')).toBe(false);
    });

    it('should return true for invalid time on today', () => {
      expect(isPastTimeSelection('today', 'invalid')).toBe(true);
      expect(isPastTimeSelection('today', '')).toBe(true);
    });

    it('should correctly compare against current time for today', () => {
      const now = new Date();
      const futureMinutes = now.getHours() * 60 + now.getMinutes() + 60;
      const futureTime = formatMinutesToTime(futureMinutes);

      // A time 1 hour in the future should not be past
      if (futureMinutes <= 23 * 60 + 59) {
        expect(isPastTimeSelection('today', futureTime)).toBe(false);
      }
    });
  });

  describe('parseTimeString', () => {
    it('should parse valid time strings', () => {
      expect(parseTimeString('14:30')).toEqual({ hour: 14, minute: 30 });
      expect(parseTimeString('7:00pm')).toEqual({ hour: 19, minute: 0 });
      expect(parseTimeString('12:00am')).toEqual({ hour: 0, minute: 0 });
    });

    it('should return 0,0 for invalid strings', () => {
      expect(parseTimeString('invalid')).toEqual({ hour: 0, minute: 0 });
      expect(parseTimeString('')).toEqual({ hour: 0, minute: 0 });
    });
  });

  describe('formatTime', () => {
    it('should format hour and minute to HH:MM', () => {
      expect(formatTime(14, 30)).toBe('14:30');
      expect(formatTime(0, 0)).toBe('00:00');
      expect(formatTime(23, 59)).toBe('23:59');
    });

    it('should clamp out of range values', () => {
      expect(formatTime(-1, 30)).toBe('00:30');
      expect(formatTime(25, 30)).toBe('23:30');
      expect(formatTime(12, -5)).toBe('12:00');
      expect(formatTime(12, 65)).toBe('12:59');
    });
  });

  describe('getDateStringForChoice', () => {
    it('should return today date in YYYY-MM-DD format', () => {
      const result = getDateStringForChoice('today');
      const today = new Date();
      const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(result).toBe(expected);
    });

    it('should return tomorrow date in YYYY-MM-DD format', () => {
      const result = getDateStringForChoice('tomorrow');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expected = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      expect(result).toBe(expected);
    });
  });
});
