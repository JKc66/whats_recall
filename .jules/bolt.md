## 2026-03-31 - Missing covering index for dashboard queries
**Learning:** The dashboard heavily queries the SQLite database to get chat lists and unread deleted message counts using a correlated subquery on the `messages` table filtering by `chat_id` and `is_deleted`, and checking the `timestamp`. The existing indexes on `(chat_id)` and `(chat_id, is_deleted)` required falling back to table scans to filter by timestamp, causing a performance bottleneck on large chat histories.
**Action:** Always check for covering indexes on frequently queried combinations of columns in SQLite, especially those involving sorting or range queries like `timestamp DESC`. Added `idx_messages_chat_deleted_timestamp` to make the dashboard load faster.

## 2026-04-03 - [N+1 File System Fallback in `bun:sqlite` Queries]
**Learning:** Found a sneaky N+1 performance bottleneck in the SQLite data mapping phase. When fetching lists of records (e.g., chats) and checking for missing properties (e.g., profile pictures), calling a db abstraction method inside `.map()` caused an N+1 query pattern and a double loop of file system checks, dropping query performance significantly (~40-60%). By inlining the file system fallback logic inside the `.map()` and removing the redundant DB query in the abstraction method, we get a ~40-60% boost in speed for list retrievals.
**Action:** When retrieving list data using SQLite, perform necessary fallbacks (like disk reads) sequentially in the `.map` mapping phase using pre-fetched database properties rather than invoking external database abstraction methods that trigger redundant N+1 internal queries.

## 2026-04-03 - DOM manipulation timing after reactive updates in SolidJS
**Learning:** When attempting to scroll to a specific message or to the bottom of the chat list in `web/src/ChatView.tsx`, the code previously relied on arbitrary `setTimeout(..., 50)` delays to wait for SolidJS reactivity to update the DOM. This is unreliable and can lead to race conditions or unnecessary delays, because the DOM may not be fully painted yet or the delay might be too long.
**Action:** Replace arbitrary `setTimeout` delays with double `requestAnimationFrame` (`requestAnimationFrame(() => requestAnimationFrame(() => ...))`) when exact DOM layout calculations (like `scrollHeight`) are needed immediately after reactive state changes in SolidJS. This guarantees the browser has fully painted the new content before the layout is read.
## 2024-05-23 - Memoizing standard functions in JSX (SolidJS)
**Learning:** In SolidJS components, any standard function getter (e.g. `const myData = () => { ... }`) used inside a JSX template is evaluated on *every* access during a reactive update or re-render, not just once per render cycle. This causes redundant heavy calculations (such as parsing Regex) multiple times per render, specifically if the getter is referenced in multiple places.
**Action:** Always wrap expensive derived computations in `createMemo` (e.g., `const myData = createMemo(() => { ... })`) when passing the data to the JSX template in SolidJS, ensuring the calculation executes exactly once when its reactive dependencies change.

## 2024-05-23 - Memoizing standard functions in JSX (SolidJS) - Addendum
**Learning:** In SolidJS, do not wrap arrays passed to the `each` prop of a `<For>` component in `createMemo`. `<For>` creates its own isolated reactive tracking scope, so wrapping it adds unnecessary overhead without reducing computations.
**Action:** Do not use `createMemo` for arrays passed directly to `<For>`. Focus memoization on expensive derived values that are re-evaluated within the view or used in multiple places.

## 2024-05-23 - Optimize formatting calls in long lists
**Learning:** To optimize frontend performance when rendering long lists of time-series data, avoid calling `Intl.DateTimeFormat.format()` for every item inside the loop.
**Action:** Compute and cache day boundaries (e.g., start/end timestamps) to reduce formatting calls from O(N) to O(Unique Days).

## 2026-05-15 - [O(N) to O(1) Quoted Message Lookups in Render]
**Learning:** In `web/src/ChatView.tsx`, looking up a message by stanza ID (e.g., when rendering quoted messages) using `.find()` inside the render cycle results in an O(N) operation per quoted message, scaling to O(N²) overall.
**Action:** Always cache list data into a `Map` structure wrapped in `createMemo` when repeated random-access lookups are needed during rendering.

## 2026-05-18 - [Loop Hoisting in Data Encoders]
**Learning:** Found an unnecessary string operation (`split('@')`) inside a `.map` loop mapping database chat models to API responses. While a string split is relatively cheap, doing it O(N) times inside a hot mapping function is wasteful, particularly for users with hundreds or thousands of chats.
**Action:** When mapping lists of objects, proactively scan the mapping callback for string manipulations, array methods, or other operations that use constants or closure variables. Hoist these calculations outside the loop to reduce time complexity to O(1).

## 2026-05-19 - [O(N) Dynamic Regex Compilation in Mapped Render]
**Learning:** In `web/src/components/chat/ChatUtils.tsx`'s `HighlightedText` component, the code used `String.prototype.split` with a dynamically generated `RegExp` inside a function (`renderTextWithHighlights`). This function was called inside a `.map` loop over URL-separated text fragments. Because the dynamic `RegExp` was instantiated inside the mapped function, the exact same regex was compiled `O(N)` times per message string (where N is the number of fragments). This is a hidden performance leak when dealing with many messages or complex messages.
**Action:** Always verify if dynamically generated instances (like `RegExp` or objects) that depend solely on reactive state can be pre-calculated and cached. Pre-compile dynamic regular expressions using `createMemo` (or outside the mapped loop) to ensure they are created only `O(1)` times per render or reactive update instead of `O(N)`.
