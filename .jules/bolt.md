## 2024-03-28 - Composite indices for correlated subqueries
**Learning:** SQLite performance degrades significantly when using correlated subqueries in SELECT statements without composite indices. In `db.getChats()`, subqueries like `(SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.chat_id AND m.is_deleted = 1)` were extremely slow over large datasets, since the optimizer couldn't efficiently filter on both `chat_id` and `is_deleted` using single-column indexes.
**Action:** When a correlated subquery filters on multiple columns or requires specific ordering within a subset (e.g., `ORDER BY timestamp DESC` for a specific `chat_id`), always create a composite index (e.g., `(chat_id, is_deleted)` or `(chat_id, timestamp DESC)`) rather than relying on multiple single-column indexes.

## 2024-03-29 - Missing createMemo for expensive operations
**Learning:** In SolidJS, calling functions inside JSX templates or inside `<For>` loops that perform array mapping, filtering, or sorting (e.g. `filteredAvailable()`) without using `createMemo` causes those expensive operations to be re-evaluated on *every* reactivity cycle affecting that component.
**Action:** Always wrap expensive list derivations (filters, sorts) in `createMemo` so they are cached and only recalculate when their specific dependencies (like the search query or the base list) change.
