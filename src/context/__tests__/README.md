# EventsContext Tests

## Overview
These tests verify that dates are correctly derived and labeled when saving events in the context layer and API.

## Key Tests

### `deriveDateLabelFromDate`
- ✅ Returns "Today" for today's date
- ✅ Returns "Tmrw" for tomorrow's date
- ✅ Returns "Today" for invalid dates (handles gracefully)
- ✅ Returns "Today" for past dates
- ✅ Returns "Today" for future dates beyond tomorrow

### Date Format Validation
- ✅ Accepts properly formatted dates (YYYY-MM-DD)
- ✅ Rejects invalid month values (< 1 or > 12)
- ✅ Rejects invalid day values (< 1 or > 31)

### Timezone Handling
- ✅ Correctly distinguishes today vs tomorrow using `Math.floor()` (not `Math.round()`)
- ✅ Handles edge cases near midnight
- ✅ Works consistently across timezones

### Month/Year Boundary Transitions
- ✅ Correctly handles month transitions (Dec 31 → Jan 1)
- ✅ Correctly handles year transitions
- ✅ Handles February leap year boundaries

## Bug Context
The `deriveDateLabelFromDate` function is called by `addUserEvent` and `updateUserEvent` to derive the `date_label` API field from the provided `eventDate`. The bug fix ensures that the date difference is calculated using `Math.floor()` for accurate day counting.

## Running Tests
```bash
npm test                 # Run all tests once
npm run test:watch      # Run tests in watch mode
```

## Related Functions
- `addUserEvent()` - Uses this to derive date_label from eventDate
- `updateUserEvent()` - Uses this to derive date_label from eventDate
- `isUpcomingEvent()` - Also fixed to use Math.floor()
