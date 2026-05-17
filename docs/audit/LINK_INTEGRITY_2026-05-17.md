# Link integrity — 2026-05-17

Pass 6: crawled 17 seed pages, harvested every 
internal `<a href>`, probed each unique target. Captured by
`e2e/link-integrity.spec.ts`.

**2 broken links** across **2 unique URLs**.

| Category | Count |
|---|---|
| 404 (real bug) | 0 |
| 5xx (real bug) | 0 |
| dev_cache (stale .next — `rm -rf .next && npm run dev`) | 0 |
| other / network | 2 |

## By target

### OTHER (2)

- `/status` → 0 — linked from: `/about/business`
- `/legal/terms` → 0 — linked from: `/about/business`
