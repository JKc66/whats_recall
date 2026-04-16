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

## 2025-04-06 - Unhandled NaN and Unbounded SQLite Limits
**Vulnerability:** URL query parameters (like `limit` or `before`) were extracted and parsed using `parseInt` without checking for `NaN` or clamping the values. Providing non-numeric strings resulted in `NaN` which triggered a SQLite `datatype mismatch` crash. Providing extremely large numbers could lead to Denial of Service (DoS) by executing unbounded queries.
**Learning:** `parseInt` will return `NaN` for invalid input, and passing `NaN` directly to a prepared statement in `bun:sqlite` triggers a fatal exception. Additionally, without an upper bound, a malicious user could pass a massive `limit`, fetching excessive records and exhausting server memory or database connections.
**Prevention:** Always check if a parsed query parameter is `NaN` (`Number.isNaN`) and establish a fallback value. Furthermore, explicitly clamp pagination parameters (e.g., maximum limit of 1000) to ensure predictable performance and prevent resource exhaustion.

## 2025-04-06 - Strict Type Checks Breaking APIs
**Vulnerability:** Adding strict `typeof x === 'string'` checks on parsed JSON request bodies to prevent object or array injection.
**Learning:** If a JSON field was previously optional or clients legitimately sent empty payloads `{}` (making the property `undefined`), strict string checks will break the API and return 400 Bad Request.
**Prevention:** When securing API endpoints with strict type or length checks, explicitly handle optional properties by coercing `undefined` to a safe fallback (e.g., `if (body.password === undefined) body.password = '';`) before applying validation.
## 2025-04-09 - Weak Random Number Generation
**Vulnerability:** The server used `Math.random()` to generate random delays for outgoing WhatsApp messages to prevent account bans. While not used for a critical cryptographic function, `Math.random()` is not cryptographically secure and is frequently flagged by static analysis tools as "Weak random number generation," which represents a violation of best practices.
**Learning:** Even for non-cryptographic purposes like simulating human delay, using `Math.random()` introduces unnecessary noise in security scans and establishes a poor pattern. The standard library provides secure alternatives that should be the default choice.
**Prevention:** Always use the Node.js `crypto` module (e.g., `crypto.randomUUID()` for identifiers, or `crypto.randomInt()` for random numbers and numeric delays) to ensure cryptographic security and clean security scans.

## 2025-04-12 - WebSocket Session Invalidation
**Vulnerability:** The server authenticated clients only during the initial HTTP upgrade to WebSocket. Once established, WebSocket connections remained permanently open and continued receiving broadcasts, even if the underlying auth session was deleted (logged out) or expired.
**Learning:** WebSocket connections are long-lived and bypass stateless middleware after the initial handshake. If you don't actively re-verify session state on existing sockets, an attacker with a stolen token (or a user logging out on a shared machine) retains real-time access indefinitely.
**Prevention:** In Hono/Bun WebSocket implementations, connections do not automatically close when a user session expires. When upgrading connections via `server.upgrade`, explicitly pass session data (e.g., `{ data: { token, fingerprint } }`) so the session validity can be re-verified periodically on active sockets (e.g., during pings or broadcasts), and explicitly disconnect them (`ws.close()`) if unauthorized.
## 2024-05-24 - Unbounded Database Query Length Check (DoS Mitigation)
**Vulnerability:** The API lacked constraints on the length of the `q` search query passed from the frontend to the backend's SQLite database search endpoints (`chats.ts`), making the system susceptible to regular expression (or SQLite `LIKE`) resource exhaustion or memory attacks via massive query payloads.
**Learning:** String bounds checks are often overlooked on basic query parameters. A massive string passed into `escapeLike` (`replace(/[%_]/g, '\\$&')`) and later SQLite can block the event loop and monopolize database resources, acting as a potential Denial of Service (DoS).
**Prevention:** Always implement max-length validation for user-provided query strings in backend API routes before passing them to the database or string replacement functions.
## 2024-04-16 - SQLite LIKE Clause Wildcard Injection Bypass
**Vulnerability:** The `escapeLike` function in `src/db/database.ts` did not escape the `\` character when constructing parameters for `LIKE ... ESCAPE '\'` queries.
**Learning:** In SQLite, when an `ESCAPE` clause defines a character like `\`, that character must *also* be escaped if present in the user's input. Otherwise, a user supplying a backslash can escape subsequent wildcards, leading to unhandled errors if at the end of the string, or leaking matching behaviour.
**Prevention:** Always escape the escape character itself using `query.replace(/[\\%_]/g, '\\$&')`.
