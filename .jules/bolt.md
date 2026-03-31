## 2026-03-31 - [Intl.DateTimeFormat Performance]
**Learning:** `toLocaleDateString` and `toLocaleTimeString` are surprisingly expensive when called in a loop (e.g., grouping 200+ messages). Reusing `Intl.DateTimeFormat` instances can improve formatting performance by ~100x and prevent UI stutter during chat transitions.
**Action:** Always reuse `Intl.DateTimeFormat` instances when formatting dates in loops or large lists.

## 2026-03-31 - [Missing Index on Sorted Fields]
**Learning:** SQLite's `ORDER BY` on a TEXT column (like an ISO-8601 date) is very fast if indexed but requires a full table scan otherwise. In a high-volume logger, this becomes a major bottleneck quickly.
**Action:** Ensure all fields used in `ORDER BY` for primary list views have indexed `DESC` or `ASC` support.
