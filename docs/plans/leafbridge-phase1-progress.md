# LeafBridge Phase 1 — Progress Log

Phase 1 of `docs/plans/leafbridge-backend-buildout-plan.md` = "make LeafBridge
real (wire the spine)": give the in-memory LeafBridge services real Postgres
store adapters.

## Architecture note (the seam)

The Next app (`src/`) **excludes** the `leafbridge/` workspace from its
TypeScript build (root `tsconfig.json` → `exclude: ["leafbridge"]`), and only
aliases `@/* → src/*`. LeafBridge is intentionally framework-free and
adapter-based. So the Postgres adapters live on the **app side**
(`src/lib/leafbridge/`) and implement a faithful structural mirror of each
LeafBridge `*Store` interface. The mirrored types carry a pointer comment to the
LeafBridge source of truth; when the spine is later published as a package, the
mirror is replaced by a direct import with zero behavior change.

## Slice 1 — FHIR persistence adapter ✅ (shipped)

The plan's named Phase-1 outcome: *"ingest a FHIR bundle → versioned FHIR rows."*

- **`StoredResource` Prisma model** (`prisma/schema.prisma`) — canonical FHIR
  JSON in `body` (JSONB), denormalized `organizationId` (no relation, keeps the
  spine table independent), composite-unique `(organizationId, resourceType,
  resourceId)` matching the store key, index on `(organizationId,
  resourceType)` for `listByType`.
- **`src/lib/leafbridge/types.ts`** — mirrors `leafbridge/fhir-persistence`
  (`FhirResource`, `FhirBundle`, `StoredResource`, `BundlePersistResult`,
  `FhirResourceStore`).
- **`src/lib/leafbridge/fhir-resource-store.ts`** —
  `PrismaFhirResourceStore implements FhirResourceStore` (upsert/get/listByType
  on `StoredResource`), plus `InMemoryFhirResourceStore` mirroring the LeafBridge
  dev/test store.
- **`src/lib/leafbridge/fhir-persistence.ts`** — `persistFhirBundle(orgId,
  bundle, { store?, now? })`, a faithful port of
  `FhirPersistenceService.persistBundle` (same zod Bundle validation, same
  `meta.versionId || "1"` versioning, same skip-with-reason behavior),
  defaulting to the Postgres store. Plus `getStoredResource` / `listStoredByType`.
- **Tests** (`fhir-persistence.test.ts`, 8 cases) — versioning, skip reasons,
  upsert-in-place, org/type read scoping (no cross-tenant leak), invalid-bundle
  and empty-org throws, empty-bundle no-op. Run against the in-memory store.

Verified: `tsc --noEmit` clean, 8/8 new tests pass (106/106 leafnerd+leafbridge),
eslint clean, live Leafnerd demo unaffected.

### Deferred: the DB migration (apply after the demo)

`prisma generate` has been run so the client is typed, but the **table is not yet
created** on the shared dev DB — nothing queries it yet, so this is safe, and it
keeps demo-eve risk at zero (the shared dev DB has known `migrate deploy` drift;
see the team's `db push` / idempotent-`DIRECT_URL` workflow). Apply post-demo:

```sql
CREATE TABLE IF NOT EXISTS "StoredResource" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "resourceType"   TEXT        NOT NULL,
  "resourceId"     TEXT        NOT NULL,
  "versionId"      TEXT        NOT NULL DEFAULT '1',
  "lastUpdated"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "body"           JSONB       NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredResource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoredResource_organizationId_resourceType_resourceId_key"
  ON "StoredResource" ("organizationId", "resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "StoredResource_organizationId_resourceType_idx"
  ON "StoredResource" ("organizationId", "resourceType");
```

(`updatedAt` is normally app-managed by Prisma `@updatedAt`; the `DEFAULT` above
just makes raw inserts safe. Then materialize a real Prisma migration so
`schema.prisma` and `prisma/migrations/` reconcile.)

## Next slices (not yet started)

1. **Wire `persistFhirBundle` into the FHIR ingest route** (`/api/integrations/fhir/*`)
   behind a flag, so a posted Bundle lands versioned rows for real.
2. **MpiService Prisma adapter** — `MpiRecord` model + `PrismaMpiStore`, wire the
   probabilistic match into the ingest path, add a duplicate-review queue.
3. **AuditLedger Prisma adapter** — `LeafBridgeAuditEvent` model (append-only).
4. **IngestionGateway + ConsentPolicyGateway adapters.**
5. **Package `leafbridge/`** so `src/` imports the interfaces directly and the
   mirrored types in `src/lib/leafbridge/types.ts` are retired.
