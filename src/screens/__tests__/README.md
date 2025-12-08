# CreateEventScreen Tests

## Overview
These tests verify that the date selection (today vs tomorrow) is correctly saved when creating or editing events.

## Key Tests

### `getDateStringForChoice`
- ✅ Converts "today" to today's date string in YYYY-MM-DD format
- ✅ Converts "tomorrow" to tomorrow's date string in YYYY-MM-DD format
- ✅ Handles month boundaries correctly (e.g., Jan 31 → Feb 1)
- ✅ Handles year boundaries correctly (e.g., Dec 31 → Jan 1 of next year)

### `getDateChoiceFromEventDate`
- ✅ Parses today's date string back to "today"
- ✅ Parses tomorrow's date string back to "tomorrow"
- ✅ Returns "today" for invalid or undefined dates
- ✅ Returns "today" for past dates (more than 1 day ago)
- ✅ Returns "today" for future dates beyond tomorrow

### Round-Trip Conversion
- ✅ "today" → date string → "today" (no data loss)
- ✅ "tomorrow" → date string → "tomorrow" (no data loss)

## Bug Fix
The bug where "tomorrow" was being saved as "today" was caused by using `Math.round()` instead of `Math.floor()` when calculating the day difference. This could cause rounding errors when the time difference was very close to 24 hours.

**Before:**
```javascript
const diffDays = Math.round((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
```

**After:**
```javascript
const diffDays = Math.floor((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
```

## Running Tests
```bash
npm test                 # Run all tests once
npm run test:watch      # Run tests in watch mode
```

## Test Coverage
Current test coverage includes:
- Date conversion and parsing
- Edge cases (month/year boundaries)
- Invalid input handling
- Timezone considerations
