## Feature 1: Event Discovery

### Finding 1: Events Never Expire
Currently, events remain labeled as "today" or "tomorrow" indefinitely. This means a "today" event might still appear as "today" even days later.  
**Resolution:** Store events with absolute dates and filter out expired events so that only current or upcoming events appear.

### Finding 2: Sections Ordered by Creation Time, Not Schedule
Event sections are currently sorted by when the event was created rather than when it’s scheduled to occur.  
**Resolution:** Change sorting logic to arrange events by their scheduled date and time.

### Finding 3: Group Batch Metadata Not Persisted
Group batch metadata is only kept in memory and isn’t saved on the server. As a result, reloading the app or using another device loses the batch information.  
**Resolution:** Persist the batch metadata on the server and return it via the `/api/events` endpoint so that batch information is consistently available.

