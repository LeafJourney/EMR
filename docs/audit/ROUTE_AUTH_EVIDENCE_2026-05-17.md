# Route auth evidence — 2026-05-17

Pass 4: unauthed POST/GET against each `needs_review` route from
`docs/security/route-auth.yaml`. Captured by
`e2e/route-auth-evidence.spec.ts` against the running dev server.

Total probes: **19** across 17 routes.

| Verdict | Count | Action |
|---|---|---|
| **OPEN** (200/2xx) | 2 | **P0** — flip to `required` + add gate now |
| **VALIDATED_BUT_UNGATED** (400) | 7 | **P0** — route processes body before auth |
| **GATED** (401/403) | 10 | Confirm + flip to `required` in manifest |
| **NOT_FOUND** (404/405) | 0 | Route or method missing — verify before closing |
| **ERROR** | 0 | Re-probe; spec failed to capture |

## OPEN (2)

### `GET /api/specialty-templates`
- **Status:** 200 (application/json)
- **Body preview:** `{"items":[{"name":"Cannabis Medicine","slug":"cannabis-medicine","description":"Certification-and-followup cannabis practice. Initial certification visit, dosing titration, and longitudinal outcome tracking with per-product efficacy logs. L`
- **Manifest note:** Specialty manifest read. Probably safe public; confirm.

### `GET /api/cron/reminders`
- **Status:** 200 (application/json)
- **Body preview:** `{"success":true,"processed":1,"sent":1}`
- **Manifest note:** 🚨 No secret-header validation detected. (Fixed in PR #243 — verify.)

## VALIDATED_BUT_UNGATED (7)

### `POST /api/feedback/whisper`
- **Status:** 400 (application/json)
- **Body preview:** `{"error":"clientId required."}`
- **Manifest note:** Whisper transcription — unmetered cost vector if open.

### `POST /api/leafmart/cart/share`
- **Status:** 400 (application/json)
- **Body preview:** `{"error":"invalid_payload"}`
- **Manifest note:** Shareable cart link mint — verify rate-limit + opacity.

### `POST /api/leafmart/account/affirmations`
- **Status:** 400 (application/json)
- **Body preview:** `{"error":"Missing version or affirmations"}`
- **Manifest note:** 🚨 Patient-bound POST, no auth detected.

### `POST /api/leafmart/products/audit-probe-1/questions`
- **Status:** 400 (application/json)
- **Body preview:** `{"error":"invalid_payload"}`
- **Manifest note:** Product Q&A — anonymous OK or requires user?

### `POST /api/leafmart/products/audit-probe-1/reviews`
- **Status:** 400 (application/json)
- **Body preview:** `{"error":"invalid_form"}`
- **Manifest note:** Product review — likely require auth + verified-purchase.

### `POST /api/marketplace/tax/calculate`
- **Status:** 400 (application/json)
- **Body preview:** `{"error":"invalid_payload","detail":"[\n {\n \"code\": \"invalid_type\",\n \"expected\": \"object\",\n \"received\": \"undefined\",\n \"path\": [\n \"shippingAddress\"\n ],\n \"message\": \"Required\"\n },\n {\n`
- **Manifest note:** Pre-checkout tax calc — public OK if rate-limited.

### `POST /api/share`
- **Status:** 400 (application/json)
- **Body preview:** `{"error":"invalid_input","issues":{"formErrors":[],"fieldErrors":{"target":["Required"],"source":["Required"],"url":["Required"]}}}`
- **Manifest note:** Share-link mint — verify it requires an authed user.

## GATED (10)

### `POST /api/configs/audit-probe-1/apply-specialty`
- **Status:** 403 (application/json)
- **Body preview:** `{"error":"FORBIDDEN","message":"Authentication required."}`
- **Manifest note:** Onboarding controller. Other config routes use requireImplementationAdmin.

### `GET /api/imaging/studies`
- **Status:** 401 (application/json)
- **Body preview:** `{"error":"UNAUTHORIZED","message":"Authentication required."}`
- **Manifest note:** 🚨 PHI surface, no auth detected.

### `GET /api/imaging/studies/audit-probe-1`
- **Status:** 401 (application/json)
- **Body preview:** `{"error":"UNAUTHORIZED","message":"Authentication required."}`
- **Manifest note:** 🚨 PHI surface, no auth detected.

### `GET /api/imaging/studies/audit-probe-1/annotations`
- **Status:** 401 (application/json)
- **Body preview:** `{"error":"UNAUTHORIZED","message":"Authentication required."}`
- **Manifest note:** 🚨 PHI surface, state-changing on POST/DELETE.

### `POST /api/imaging/studies/audit-probe-1/annotations`
- **Status:** 401 (application/json)
- **Body preview:** `{"error":"UNAUTHORIZED","message":"Authentication required."}`
- **Manifest note:** 🚨 PHI surface, state-changing on POST/DELETE.

### `DELETE /api/imaging/studies/audit-probe-1/annotations`
- **Status:** 401 (application/json)
- **Body preview:** `{"error":"UNAUTHORIZED","message":"Authentication required."}`
- **Manifest note:** 🚨 PHI surface, state-changing on POST/DELETE.

### `POST /api/cron/coa-tracker`
- **Status:** 401 (application/json)
- **Body preview:** `{"error":"unauthorized"}`
- **Manifest note:** 🚨 No secret-header validation detected.

### `POST /api/vendor-portal/auth/totp/enroll`
- **Status:** 401 (application/json)
- **Body preview:** `{"error":"no_session"}`
- **Manifest note:** TOTP enrollment — must require an authenticated session.

### `GET /api/reports/competitive-analysis`
- **Status:** 401 (application/json)
- **Body preview:** `{"error":"UNAUTHORIZED","message":"Authentication required."}`
- **Manifest note:** 🚨 Competitive-analysis report generated without auth.

### `POST /api/dispensary/ingest`
- **Status:** 401 (application/json)
- **Body preview:** `{"error":"unauthorized"}`
- **Manifest note:** 🚨 Ingest endpoint with no auth detected.
