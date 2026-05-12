# Link integrity — 2026-05-12

Pass 6: crawled 17 seed pages, harvested every 
internal `<a href>`, probed each unique target. Captured by
`e2e/link-integrity.spec.ts`.

**46 broken links** across **46 unique URLs**.

| Category | Count |
|---|---|
| 404 (real bug) | 35 |
| 5xx (real bug) | 11 |
| dev_cache (stale .next — `rm -rf .next && npm run dev`) | 0 |
| other / network | 0 |

## By target

### 404 (35)

- `/marketplace/products/solace-nightfall-tincture` → 404 — linked from: `/marketplace`
- `/marketplace/products/verdana-relief-balm` → 404 — linked from: `/marketplace`
- `/marketplace/products/solace-calm-drops` → 404 — linked from: `/marketplace`
- `/marketplace/products/botanica-ease-gummies` → 404 — linked from: `/marketplace`
- `/marketplace/products/stillwater-sleep-tonic` → 404 — linked from: `/marketplace`
- `/marketplace/products/field-balm-no-4` → 404 — linked from: `/marketplace`
- `/marketplace/products/gold-skin-serum` → 404 — linked from: `/marketplace`
- `/marketplace/products/canopy-clinical-balance-capsules` → 404 — linked from: `/marketplace`
- `/marketplace/products/verdana-recovery-gel` → 404 — linked from: `/marketplace`
- `/marketplace/products/canopy-clinical-focus-capsules` → 404 — linked from: `/marketplace`
- `/marketplace/products/solace-restore-vape` → 404 — linked from: `/marketplace`
- `/marketplace/products/botanica-soothe-softgels` → 404 — linked from: `/marketplace`
- `/marketplace/products/verdana-uplift-tincture` → 404 — linked from: `/marketplace`
- `/marketplace/products/botanica-rest-gummies` → 404 — linked from: `/marketplace`
- `/marketplace/products/solace-tension-patch` → 404 — linked from: `/marketplace`
- `/marketplace/products/quiet-hours-tincture` → 404 — linked from: `/marketplace`
- `/marketplace/products/twilight-capsules` → 404 — linked from: `/marketplace`
- `/marketplace/products/lullaby-sleep-tea` → 404 — linked from: `/marketplace`
- `/marketplace/products/drift-pillow-mist` → 404 — linked from: `/marketplace`
- `/marketplace/products/crescent-cbn-gummies` → 404 — linked from: `/marketplace`
- `/marketplace/products/trailhead-roll-on` → 404 — linked from: `/marketplace`
- `/marketplace/products/mineral-bath-soak` → 404 — linked from: `/marketplace`
- `/marketplace/products/day-after-cream` → 404 — linked from: `/marketplace`
- `/marketplace/products/liniment-splash` → 404 — linked from: `/marketplace`
- `/marketplace/products/easy-hours-tincture` → 404 — linked from: `/marketplace`
- `/marketplace/products/hum-beverage` → 404 — linked from: `/marketplace`
- `/marketplace/products/settle-gummies` → 404 — linked from: `/marketplace`
- `/marketplace/products/steady-drops` → 404 — linked from: `/marketplace`
- `/marketplace/products/pause-pen` → 404 — linked from: `/marketplace`
- `/marketplace/products/renewal-face-oil` → 404 — linked from: `/marketplace`
- `/marketplace/products/bloom-body-lotion` → 404 — linked from: `/marketplace`
- `/marketplace/products/petal-cleanser` → 404 — linked from: `/marketplace`
- `/marketplace/products/clear-mornings-tincture` → 404 — linked from: `/marketplace`
- `/legal/donor-faq` → 404 — linked from: `/foundation`
- `/legal/form-990.pdf` → 404 — linked from: `/foundation`

### 5XX (11)

- `/sign-in` → 500 — linked from: `/`
- `/sign-up` → 500 — linked from: `/`
- `/leafmart/category/rest` → 500 — linked from: `/leafmart`
- `/leafmart/category/relief` → 500 — linked from: `/leafmart`
- `/leafmart/category/calm` → 500 — linked from: `/leafmart`
- `/leafmart/category/skin` → 500 — linked from: `/leafmart`
- `/leafmart/category/focus` → 500 — linked from: `/leafmart`
- `/leafmart/products/stillwater-sleep-tonic` → 500 — linked from: `/leafmart`
- `/leafmart/products/field-balm-no-4` → 500 — linked from: `/leafmart`
- `/leafmart/products/quiet-hours-tincture` → 500 — linked from: `/leafmart`
- `/leafmart/products/gold-skin-serum` → 500 — linked from: `/leafmart`
