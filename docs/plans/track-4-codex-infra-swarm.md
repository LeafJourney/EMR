# Codex Swarm Instructions: Track 4 — Infrastructure, Compliance, DB Schemas & APIs

You are assigned to **Track 4: Infrastructure, Compliance, DB Schemas & APIs**. Your primary focus is on database schema changes, EDI X12 transaction generators/parsers, compliance reporting scripts, API gateways, agent workflow models, and wearable analytics engines.

## Swarm Operational Directives

### 1. Codex Environment Setup
Ensure database connection strings are local or sandbox-safe. Always run prisma generation after editing the schema:
```bash
npx prisma format
npx prisma generate
```

### 2. Architectural Rules (AGENTS.md & Audit Directives)
- **Agent Action Limits:** Every agent action must be logged into `AgentJob.logs` with a timestamp. Every write must produce an `AuditLog` row with `actor = "agent:<name>@<version>"` and a JSON patch.
- **Credentialing Licenses:** Track clinical licensing metrics and check against OIG exclusions list. Use stub database checks for V1, failing gracefully to warnings.
- **Rule Verification:** All wearables analytics code must be pure-function, taking patient inputs and returning alerts without making DB calls during logic parsing.
- **Schema Safety:** Do not drop tables that are actively used. Use optional columns with defaults where necessary.

---

## Technical Goals & Target Paths

Most of your changes will target:
- `prisma/schema.prisma` (Database schema definitions)
- `src/lib/agents/` (Orchestration agent files & triggers)
- `src/lib/orchestration/` (Agent job routers, actions registry)
- `src/lib/edi/` or `src/lib/billing/` (EDI 837P generation, 835 ERA ingestion)
- `src/lib/compliance/` or `src/lib/security/` (HIPAA security checkers, audit logs)
- `src/lib/cds/` (Wearables rules engine and deduplicating alert router)

---

## 65 Backlog Cards Specification

Execute development and logical fixes for the following cards:

1. **EMR-216 (Real EDI 837P Generator):** Generates valid ANSI X12 v5010 837P claim files, including Loop 2000A, 2000B, and 2300, matching CMS formatting rules.
2. **EMR-217 (Clearinghouse Client):** HTTPS client connection adapter for uploading 837P payloads and checking response queues.
3. **EMR-218 (Payer Rules Engine):** Database schema and rules evaluator parsing custom validation checks per insurance payer.
4. **EMR-219 (Secondary Claim Filing):** Loop 2320 CAS parser enabling claims to fall back to secondary payers when primary pays partially.
5. **EMR-220 (NPI & Tax ID Schema):** Extend Organization and User/Clinician schemas to support National Provider Identifiers (NPI) and Tax IDs.
6. **EMR-221 (ERA / 835 Raw Ingestion):** Parse incoming 835 Electronic Remittance Advice files, extracting payment, adjustment, and denial details.
7. **EMR-222 (NCCI / MUE Reference Tables):** Script to load CMS quarterly National Correct Coding Initiative (NCCI) edit rules into tables.
8. **EMR-223 (Contract Allowable Tables):** Schema modeling expected allowed reimbursement amounts per procedure code per insurance carrier.
9. **EMR-224 (Lockbox bank deposit matching):** Idempotent matching function pairing bank deposit ACH lines with 835 remittance logs.
10. **EMR-225 (Statement auto-generator):** Server action triggering batch PDF statements and e-delivery queues.
11. **EMR-226 (Payment plan engine):** Autopay daemon executing monthly credit card payments based on active installments agreements.
12. **EMR-227 (NSF chargeback handler):** Mark payments as bounced and generate administrative workflow warnings.
13. **EMR-228 (Appeals Learning Loop):** Learn and report which appeal text arguments are most successful against denial codes.
14. **EMR-229 (Prior-auth portal adapters):** JSON client scraping and formatting details for submission to payer portals.
15. **EMR-230 (RCM daily-close report):** Cron action compiling total collections and highlighting unposted payments.
16. **EMR-974 (Agent Fleet schemas):** Prisma schema adding AgentSettings table and UI API routes to manage operational limits.
17. **EMR-969 (Agent Fleet hover API):** API route returning summaries of running agent counts and jobs handled.
18. **EMR-960 (Default approve decisions):** Configuration map setting whether specific jobs need clinician sign-off or auto-complete.
19. **EMR-958 (Bulk Approve/Reject handlers):** Server action to authorize or discard hundreds of queued agent tasks.
20. **EMR-951 (All Jobs DB indexes):** Add Prisma indexes on `status`, `createdAt`, and `type` fields in orchestration tables.
21. **EMR-940 (Metric tiles API routes):** REST endpoints supplying count aggregates for dashboard filtering.
22. **EMR-788 (Supply & SupplyOrder Schema):** Prisma tables representing medical supply items, inventory counts, and order lists.
23. **EMR-789 (supplyReorderAgent):** An AI Agent worker watching inventory levels and drafting reorder sheets.
24. **EMR-790 (practiceManagerAgent):** A meta-orchestrator coordinating subordinate agents across clinics.
25. **EMR-411 (Shell Rendering Engine):** Server-side layout loader adapting EMR features dynamically.
26. **EMR-409 (Practice Configuration Object):** Prisma schema storing custom clinic preferences and modalities.
27. **EMR-408 (Specialty Template Registry):** JSON list mapping clinical templates to specialty fields (e.g. Oncology, Cannabinoid).
28. **EMR-410 (Modality Control Layer):** Server-side gating logic blocking clinician access to disabled modalities.
29. **EMR-407 (Practice Onboarding Controller):** Onboarding wizard engine driving setup checklists.
30. **EMR-472 (Rollback draft creation):** Server action generating a new draft note from an older version in audit tables.
31. **EMR-471 (Version history diff API):** Return text-level diffs between two clinical note snapshots.
32. **EMR-470 (Audit log transitions):** Middleware recording every database transaction, user ID, and modified fields.
33. **EMR-441 (Modality route gate):** Middleware checking request headers and routing matching gates.
34. **EMR-428 (RBAC restrictions):** Gate setup controls strictly to Super Admin and Implementation Admin roles.
35. **EMR-724 (SaaS Billing & AI Brokering):** API gateway monitoring model token consumption per organization.
36. **EMR-723 (Audit & Versioning Surface):** Exportable clinical note audit history records.
37. **EMR-421 (Specialty Select Step):** API endpoint saving chosen primary practice specialties.
38. **EMR-636 (Cloud Architecture verification):** Disaster recovery mock scripting and cloud infrastructure checks.
39. **EMR-635 (Medicare Security Assessment):** Generate administrative PDF reporting security compliance settings.
40. **EMR-633 (HIPAA Privacy & Breach Notification):** Auto-alert triggers notifying admins if broad Patient profile reads occur.
41. **EMR-632 (HIPAA Security Rule alignment):** Enforce JWT token expiration and file encryption checks.
42. **EMR-629 (Credentialing Alerts):** Cron checker checking user profiles against federal OIG exclusions list.
43. **EMR-628 (Payer enrollment workflow):** State machine mapping providers status per insurance network.
44. **EMR-627 (Re-credentialing scheduler):** Alert generator flagging provider licenses expiring within 90 days.
45. **EMR-625 (Provider Profile Verification):** Standardizing primary-source checking routines.
46. **EMR-622 (Claim Scrubbing edits engine):** Pure server-side validator validating ICD-10/CPT modifiers.
47. **EMR-621 (Clearinghouse acknowledgments):** Parse 999 Functional Acknowledgments and 277CA Claim Acknowledgments.
48. **EMR-619 (Clearinghouse 835 Ingestion):** Automated cron file reader scanning clearinghouse folders.
49. **EMR-618 (Claim Submission Engine):** SFTP gateway client securely uploading 837 files.
50. **EMR-581 (Alert Router Deduplication):** Enforce a 24-hour limit preventing duplicated wearable alerts.
51. **EMR-580 (CDS Rules Engine):** Evaluate patient physiological metrics (Whoop, HRV, Sleep) and report risks.
52. **EMR-582 (Sync Daemon Cron Route):** Ingest smartwatch statistics, run rules, and trigger alerts.
53. **EMR-469 (Version Snapshot Table):** Schema defining static snapshots written when note is published.
54. **EMR-457 (Source Connectors API):** Ingest CSV records and stubbed FHIR R4 resources.
55. **EMR-456 (Import job runner):** Job scheduler verifying import progress checkpoints to support resume action.
56. **EMR-453 (MigrationProfile schema):** Prisma model tracking import session configs.
57. **EMR-444 (Module Descriptor Registry):** JSON validator reading which app widgets are active.
58. **EMR-439 (Modality Check Helper):** Server helper function `isModalityEnabled`.
59. **EMR-438 (Modality registry enum):** Add standard slugs mapping clinic modules.
60. **EMR-436 (Status constraints state machine):** Ensure single-tenant publishing limits.
61. **EMR-435 (Configuration CRUD API):** REST operations managing practice settings.
62. **EMR-434 (PracticeConfiguration table):** Database schema holding JSON setup parameters.
63. **EMR-430 (Template Application Registry):** API mapping clinical specialty templates.
64. **EMR-429 (Specialty Schema manifest):** JSON schema defining fields for note templates.
65. **EMR-418 (Controller state machine):** Onboarding progress state controller.

---

## Verification Commands

Always run these tests before submitting backend PRs:
```bash
npm run typecheck
npm run lint
npx vitest run
```
