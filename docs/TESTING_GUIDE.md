# Testing Guide - Date Selection Bug Fix

## Quick Start

```bash
# Install dependencies (if not done)
npm install --legacy-peer-deps

# Run all tests
npm test

# Run in watch mode (auto-rerun on file changes)
npm run test:watch
```

## Test Results

All 31 tests pass ✅

```
Test Suites: 3 passed, 3 total
Tests:       31 passed, 31 total
Time:        ~12-17 seconds
```

## What Was Fixed

### The Bug
When users selected "tomorrow" when creating an event, it was being saved as "today".

### The Root Cause
Two functions were using `Math.round()` instead of `Math.floor()` when calculating day differences:
1. `getDateChoiceFromEventDate` in CreateEventScreen.tsx
2. `deriveDateLabelFromDate` in EventsContext.tsx
3. `isUpcomingEvent` in EventsContext.tsx (also fixed)

### The Solution
Changed all three instances from `Math.round()` to `Math.floor()` to ensure accurate day counting:

```javascript
// Before (Wrong)
const diffDays = Math.round(timeDifference / MS_PER_DAY);

// After (Correct)
const diffDays = Math.floor(timeDifference / MS_PER_DAY);
```

## Test Structure

### File Organization
```
src/
├── __tests__/
│   └── DateSelectionIntegration.test.ts    (7 integration tests)
├── screens/
│   └── __tests__/
│       ├── CreateEventScreen.test.ts        (13 unit tests)
│       └── README.md                        (documentation)
├── context/
│   └── __tests__/
│       ├── EventsContext.test.ts            (11 unit tests)
│       └── README.md                        (documentation)
```

### Test Categories

#### Unit Tests (24 tests)
1. **CreateEventScreen Tests** (13 tests)
   - `getDateStringForChoice()` function tests
   - `getDateChoiceFromEventDate()` function tests
   - Round-trip conversion tests
   - Edge case handling

2. **EventsContext Tests** (11 tests)
   - `deriveDateLabelFromDate()` function tests
   - Date format validation
   - Timezone handling
   - Month/year boundary transitions

#### Integration Tests (7 tests)
- User creates event for tomorrow
- User creates event for today
- User edits tomorrow event (keeps tomorrow)
- User edits today event (changes to tomorrow)
- Multiple consecutive events
- API payload generation
- Timezone edge case verification

## How Each Test Works

### Example: Test "User creates event for tomorrow"

```typescript
it("should correctly save and retrieve tomorrow event with proper label", () => {
  // Step 1: User selects "tomorrow" in CreateEventScreen
  const userSelection = "tomorrow";

  // Step 2: Convert to date string for API
  const eventDate = getDateStringForChoice(userSelection);
  // Result: "2025-11-25" (if today is Nov 24)

  // Step 3: Verify format
  expect(eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // Step 4: Simulate API save/retrieve
  // (In real app: addUserEvent({ eventDate, ... }))

  // Step 5: Derive label from stored date
  const derivedLabel = deriveDateLabelFromDate(eventDate);
  // Result: "Tmrw"

  // Step 6: Verify label matches original selection
  expect(derivedLabel).toBe("Tmrw"); ✅
});
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
# CreateEventScreen tests only
npm test -- CreateEventScreen.test.ts

# EventsContext tests only
npm test -- EventsContext.test.ts

# Integration tests only
npm test -- DateSelectionIntegration.test.ts
```

### Watch Mode (for development)
```bash
npm run test:watch
```
This automatically reruns tests when you make changes.

### Run with Coverage Report
```bash
npm test -- --coverage
```

### Run Single Test
```bash
npm test -- -t "should correctly save and retrieve tomorrow event"
```

## Understanding Test Output

When you run tests, you'll see:

```
PASS src/context/__tests__/EventsContext.test.ts
  EventsContext - Date Label Derivation
    deriveDateLabelFromDate
      ✓ should return 'Today' for today's date (21 ms)
      ✓ should return 'Tmrw' for tomorrow's date (2 ms)
      ✓ should return 'Today' for invalid dates (3 ms)
    ...

Test Suites: 3 passed, 3 total
Tests:       31 passed, 31 total
```

- **PASS** = All tests in this file passed
- **✓** = Individual test passed
- **(21 ms)** = Time taken for that test
- **Test Suites** = Number of test files
- **Tests** = Total number of test cases

## Key Test Scenarios

### Scenario 1: Create Tomorrow Event
```
Setup:    User creates new event, selects "tomorrow"
Process:  getDateStringForChoice("tomorrow") → "2025-11-25"
Save:     API stores eventDate = "2025-11-25"
Retrieve: deriveDateLabelFromDate("2025-11-25") → "Tmrw"
Result:   Event shows as "Tomorrow" ✅
```

### Scenario 2: Edit Event (Today → Tomorrow)
```
Setup:    Event created for "today"
Edit:     User opens event, changes date to "tomorrow"
Process:  getDateStringForChoice("tomorrow") → "2025-11-25"
Update:   API updates eventDate = "2025-11-25"
Retrieve: deriveDateLabelFromDate("2025-11-25") → "Tmrw"
Result:   Event shows as "Tomorrow" ✅
```

### Scenario 3: Month Boundary (Jan 31 → Feb 1)
```
Setup:    Today is Jan 31, user selects "tomorrow"
Process:  getDateStringForChoice("tomorrow") → "2025-02-01"
Save:     API stores eventDate = "2025-02-01"
Retrieve: deriveDateLabelFromDate("2025-02-01") → "Tmrw"
Result:   Event correctly shows as "Tomorrow" (next month) ✅
```

### Scenario 4: Year Boundary (Dec 31 → Jan 1)
```
Setup:    Today is Dec 31, user selects "tomorrow"
Process:  getDateStringForChoice("tomorrow") → "2026-01-01"
Save:     API stores eventDate = "2026-01-01"
Retrieve: deriveDateLabelFromDate("2026-01-01") → "Tmrw"
Result:   Event correctly shows as "Tomorrow" (next year) ✅
```

## Edge Cases Tested

✅ **Date Format**
- YYYY-MM-DD format enforced
- Invalid formats handled gracefully

✅ **Boundary Transitions**
- Last day of month → first day of next month
- Last day of year → first day of next year
- Leap year (Feb 29) handling

✅ **Invalid Inputs**
- Undefined/null dates → defaults to "Today"
- Invalid month (13, 0) → defaults to "Today"
- Invalid day (32, 0) → defaults to "Today"

✅ **Timezone Considerations**
- Math.floor ensures consistent behavior
- No rounding errors near midnight

## Development Workflow

### During Development
```bash
# Start watch mode
npm run test:watch

# Make code changes
# Tests auto-run and show results

# Fix any failing tests
# Tests pass when done
```

### Before Commit
```bash
# Run full test suite
npm test

# Ensure all tests pass
# Then commit
```

### Adding New Tests
1. Create test file in `src/**/__tests__/*.test.ts`
2. Use same pattern as existing tests
3. Run `npm run test:watch`
4. Jest will auto-detect and run the new test

## Troubleshooting

### Tests Not Running
```bash
# Clear Jest cache
npm test -- --clearCache

# Reinstall dependencies
rm -rf node_modules
npm install --legacy-peer-deps
```

### Specific Test Failing
```bash
# Run only that test with verbose output
npm test -- -t "test name" --verbose

# Check the error message and stack trace
```

### Changes Not Reflected
```bash
# Make sure watch mode is running
npm run test:watch

# If using regular npm test, you need to run it again
npm test
```

## Configuration

### jest.config.js
```javascript
{
  preset: 'react-native',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@context/(.*)$': '<rootDir>/src/context/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    // ... more aliases
  }
}
```

### package.json Scripts
```json
{
  "test": "jest",
  "test:watch": "jest --watch"
}
```

## CI/CD Integration

To run tests automatically (example GitHub Actions):

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install --legacy-peer-deps
      - run: npm test
```

## Next Steps

1. ✅ Run `npm test` to verify all tests pass
2. ✅ Use `npm run test:watch` during development
3. ✅ Ensure tests pass before committing
4. 📝 Add to pre-commit hooks (optional)
5. 🚀 Deploy with confidence knowing date logic is tested

## References

- [Jest Documentation](https://jestjs.io/)
- [TypeScript with Jest](https://kulshekhar.github.io/ts-jest/)
- [Test-Driven Development](https://en.wikipedia.org/wiki/Test-driven_development)

