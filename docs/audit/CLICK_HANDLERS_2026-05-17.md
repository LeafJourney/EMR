# Click-handler findings — 2026-05-17

Pass 8: walked 1 public routes, found
**40** interactive elements, attempted
**6** clicks (0 skipped by safety filter).
Captured by `e2e/click-handlers.spec.ts`.

**2 findings** — 0 high, 2 medium, 0 low.

| Kind | Count |
|---|---|
| console_error_on_click | 1 |
| failed_request_on_click | 1 |

## By URL

### `/pricing` (2)
- **MED** console_error_on_click — `Demo` (`body > div > header > div > a:nth-of-type(2) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** failed_request_on_click — `Demo` (`body > div > header > div > a:nth-of-type(2) > button`) — POST http://localhost:3000/ → network failure
