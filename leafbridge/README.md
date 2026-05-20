# LeafBridge Data Core

The data-plane foundation for LeafBridge: the layer between external clinical
data sources (HL7/FHIR endpoints, lab feeds, dispensary point-of-sale, partner
EMRs) and the Leafjourney domain models that power patient-facing surfaces.

Three services live here:

| Module                | Ticket   | Responsibility                                                                                  |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `ingestion-gateway/`  | EMR-763  | Authenticated entry point for inbound payloads — schema validation, rate-limit hook, enqueue.   |
| `fhir-persistence/`   | EMR-764  | FHIR R4 Bundle storage — splits a Bundle into resource rows keyed by `(resourceType, id, ver)`. |
| `mpi/`                | EMR-765  | Master Patient Index — deterministic + probabilistic match across demographic identifiers.       |

## Why this lives outside `src/`

`src/lib/integrations/fhir-adapter.ts` is the application-facing surface used by
the Next.js route at `src/app/api/integrations/fhir/ingest/route.ts`. The data
core is intentionally framework-free: no Next, no Prisma, no Clerk. It expresses
the storage and matching contract as pure TypeScript that any runtime — a Next
route handler, a worker, or a CLI — can adopt.

Each module exposes:

- A **service class** with the public API.
- A **store interface** describing the persistence contract.
- An **in-memory store** so the module is exercisable in tests and local dev
  without a database.
- **Zod schemas** at every input boundary.

To wire any of these into a production runtime, supply a concrete store
implementation (Prisma-backed, Postgres-backed, etc.) that satisfies the
interface.
