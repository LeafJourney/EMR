# Click-handler findings — 2026-05-17

Pass 8: walked 1 public routes, found
**32** interactive elements, attempted
**5** clicks (0 skipped by safety filter).
Captured by `e2e/click-handlers.spec.ts`.

**7 findings** — 0 high, 7 medium, 0 low.

| Kind | Count |
|---|---|
| failed_request_on_click | 2 |
| console_error_on_click | 4 |
| click_threw | 1 |

## By URL

### `/features` (7)
- **MED** failed_request_on_click — `Demo` (`body > div > header > div > a:nth-of-type(2) > button`) — GET http://localhost:3000/sign-up?_rsc=1fpi5 → network failure
- **MED** console_error_on_click — `Join` (`div > footer > div > div:nth-of-type(1) > div:nth-of-type(2) > form > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** click_threw — `Product+` (`body > div > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button`) — locator.click: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('body > div > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button').first()[22m
[2m    - locator resolved to
- **MED** console_error_on_click — `Product+` (`body > div > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Product+` (`body > div > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Product+` (`body > div > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** failed_request_on_click — `Product+` (`body > div > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button`) — GET http://localhost:3000/features?_rsc=1wjbl → network failure
