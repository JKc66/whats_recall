## 2023-10-27 - Overly Permissive CORS Configuration
**Vulnerability:** The server used an overly permissive CORS configuration (`origin: (origin) => origin` with `credentials: true`), which dynamically allowed any external domain to make authenticated requests and read sensitive data, bypassing Same-Origin Policy.
**Learning:** Development conveniences (like allowing Vite on a different port to talk to the backend) often leak into production if environment variables are not strictly checked. Returning the requested origin indiscriminately when `credentials: true` is set completely negates CSRF and cross-origin isolation.
**Prevention:** Always restrict CORS `origin` functions to explicitly trusted domains or bind permissive behavior tightly to `NODE_ENV === development`. In production, if the frontend and backend share the same origin, CORS headers should be omitted entirely by returning an empty string.

## 2025-04-01 - SQL Wildcard Injection
**Vulnerability:** User input for database search features was passed into SQL `LIKE` clauses without proper wildcard escaping, allowing queries with `%` or `_` to be evaluated as wildcards rather than literal text.
**Learning:** While parameterized queries (`?`) protect against full SQL injection, unescaped `LIKE` clauses still expose the application to wildcard injection. This can lead to logic bypasses (e.g. searching for all records instead of one) or potential Denial of Service (DoS) due to expensive database operations.
**Prevention:** Whenever taking user input meant to act as literal text in a `LIKE` clause, always use an escape function (e.g. `escapeLike`) to escape `%` and `_` characters, and combine it with the `ESCAPE '\'` SQL statement modifier.

## 2025-04-03 - Timing Attack in Password Verification
**Vulnerability:** The authentication system compared user-provided passwords against the configured server password using standard string comparison operators (`!==`). This allows attackers to perform timing attacks by measuring the time it takes for the comparison to fail, effectively guessing the password one character at a time.
**Learning:** String comparison operators in JavaScript typically fail fast, meaning they terminate early as soon as a mismatch is found. In authentication paths where secrets are compared, this timing differential is a measurable side-channel.
**Prevention:** Always use `crypto.timingSafeEqual` for sensitive password or token comparisons to ensure the comparison takes a constant amount of time regardless of where the mismatch occurs. To be fully secure against length-based timing attacks, ensure both buffers are the same length before comparison, and provide a dummy comparison using the same API when lengths differ.

## 2025-01-01 - [JSON Body Parsing DoS and Unhandled Exceptions]
**Vulnerability:** Unbounded JSON payload sizes and unhandled exceptions in Hono `c.req.json()` calls.
**Learning:** Hono `c.req.json()` buffers the entire request body into memory. To prevent Denial of Service (DoS) via massive payloads and unhandled exceptions, apply Hono's `bodyLimit` middleware to routes before parsing the body, and always wrap the parsing in a `try...catch` block.
**Prevention:** Ensure that all endpoints accepting JSON payloads use `bodyLimit` and `try...catch` around `c.req.json()`.
