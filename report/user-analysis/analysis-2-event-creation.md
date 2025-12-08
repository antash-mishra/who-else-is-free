## Feature 2: Event Creation

### 1. Unauthenticated Event Creation
Events can currently be created without authentication.  
**Fix:** Require user authentication before allowing event creation.

### 2. Date Handling Limited to “Today” and “Tomorrow”
The system only treats events as “today” or “tomorrow,” without storing actual dates.  
**Fix:**  
- Store the real date in absolute date format in the backend.  
- Continue displaying events on the frontend as “Today” or “Tomorrow.”  
- Automatically remove events whose dates fall outside of today or tomorrow.

### 3. Group Type Stored Only on Client-Side
Group type (single or group) is currently stored only on the client side.  
**Fix:** Save group type in the backend so events can be displayed correctly.

### 4. Time Validation Only in UI
Past times are disabled in the UI picker, but the backend still accepts past event submissions.  
**Fix:** Add backend validation to block event creation for past timestamps.