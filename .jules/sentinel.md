## 2023-10-27 - Overly Permissive CORS Configuration
**Vulnerability:** The server used an overly permissive CORS configuration (`origin: (origin) => origin` with `credentials: true`), which dynamically allowed any external domain to make authenticated requests and read sensitive data, bypassing Same-Origin Policy.
**Learning:** Development conveniences (like allowing Vite on a different port to talk to the backend) often leak into production if environment variables are not strictly checked. Returning the requested origin indiscriminately when `credentials: true` is set completely negates CSRF and cross-origin isolation.
**Prevention:** Always restrict CORS `origin` functions to explicitly trusted domains or bind permissive behavior tightly to `NODE_ENV === development`. In production, if the frontend and backend share the same origin, CORS headers should be omitted entirely by returning an empty string.

## 2025-04-01 - SQL Wildcard Injection
**Vulnerability:** User input for database search features was passed into SQL `LIKE` clauses without proper wildcard escaping, allowing queries with `%` or `_` to be evaluated as wildcards rather than literal text.
**Learning:** While parameterized queries (`?`) protect against full SQL injection, unescaped `LIKE` clauses still expose the application to wildcard injection. This can lead to logic bypasses (e.g. searching for all records instead of one) or potential Denial of Service (DoS) due to expensive database operations.
**Prevention:** Whenever taking user input meant to act as literal text in a `LIKE` clause, always use an escape function (e.g. `escapeLike`) to escape `%` and `_` characters, and combine it with the `ESCAPE '\'` SQL statement modifier.
