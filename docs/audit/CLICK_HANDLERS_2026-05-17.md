# Click-handler findings — 2026-05-17

Pass 8: walked 2 public routes, found
**41** interactive elements, attempted
**30** clicks (1 skipped by safety filter).
Captured by `e2e/click-handlers.spec.ts`.

**37 findings** — 0 high, 37 medium, 0 low.

| Kind | Count |
|---|---|
| console_error_on_click | 29 |
| click_threw | 6 |
| failed_request_on_click | 2 |

## By URL

### `/licensing` (35)
- **MED** console_error_on_click — `Demo` (`body > header > div > a:nth-of-type(2) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Print HTML` (`body > main > header > div > a:nth-of-type(1) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Raw JSON` (`body > main > header > div > a:nth-of-type(2) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `See pricing` (`body > main > header > div > a:nth-of-type(3) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `See pricing` (`body > main > header > div > a:nth-of-type(3) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Join` (`body > footer > div > div:nth-of-type(1) > div:nth-of-type(2) > form > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** click_threw — `Product+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button`) — locator.click: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('body > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button').first()[22m
[2m    - locator resolved to <butt
- **MED** console_error_on_click — `Product+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Product+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(1) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** click_threw — `Company+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(2) > button`) — locator.click: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('body > footer > div > div:nth-of-type(2) > div:nth-of-type(2) > button').first()[22m
[2m    - locator resolved to <butt
- **MED** console_error_on_click — `Company+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(2) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Company+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(2) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** click_threw — `Resources+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(3) > button`) — locator.click: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('body > footer > div > div:nth-of-type(2) > div:nth-of-type(3) > button').first()[22m
[2m    - locator resolved to <butt
- **MED** console_error_on_click — `Resources+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(3) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Resources+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(3) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** click_threw — `Legal+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(4) > button`) — locator.click: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('body > footer > div > div:nth-of-type(2) > div:nth-of-type(4) > button').first()[22m
[2m    - locator resolved to <butt
- **MED** console_error_on_click — `Legal+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(4) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Legal+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(4) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Legal+` (`body > footer > div > div:nth-of-type(2) > div:nth-of-type(4) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `↑ Back to top` (`body > footer > div > div:nth-of-type(3) > div:nth-of-type(1) > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Send feedback` (`body > button`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** click_threw — `Skip to content` (`body > a`) — locator.click: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('body > a').first()[22m
[2m    - locator resolved to <a href="#main-content" class="sr-only focus:not-sr-only focus:fixe
- **MED** console_error_on_click — `Skip to content` (`body > a`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Skip to content` (`body > a`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Leafjourney home` (`body > header > div > a:nth-of-type(1)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** failed_request_on_click — `Leafjourney home` (`body > header > div > a:nth-of-type(1)`) — POST http://localhost:3000/ → network failure
- **MED** console_error_on_click — `About` (`body > header > div > nav > a:nth-of-type(1)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Security` (`body > header > div > nav > a:nth-of-type(2)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Education` (`body > header > div > nav > a:nth-of-type(3)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `LeafMart` (`body > header > div > nav > a:nth-of-type(4)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Marketplace` (`body > header > div > nav > a:nth-of-type(5)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Developer` (`body > header > div > nav > a:nth-of-type(6)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Print HTML` (`body > main > header > div > a:nth-of-type(1)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `Raw JSON` (`body > main > header > div > a:nth-of-type(2)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart
- **MED** console_error_on_click — `See pricing` (`body > main > header > div > a:nth-of-type(3)`) — Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s https://www.theleafmart

### `/clinicians` (2)
- **MED** click_threw — `Skip to content` (`body > a`) — locator.click: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('body > a').first()[22m
[2m    - locator resolved to <a href="#main-content" class="sr-only focus:not-sr-only focus:fixe
- **MED** failed_request_on_click — `Dr. Marcus Okafor, DO` (`body > div > ul > li:nth-of-type(2) > div > div > a`) — GET http://localhost:3000/clinicians/marcus-okafor-do?_rsc=14dvb → network failure
