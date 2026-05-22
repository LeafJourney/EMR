# Tenant isolation — defense in depth

Three layers. Every new table picks at least one. App-layer-only isolation
is forbidden.

## Layer 1 — Database column + RLS

Every Tier A table carries a `tenant_id uuid not null` column. Row-level
security on every table:

```sql
alter table patient enable row level security;

create policy patient_tenant_isolation on patient
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

`app.tenant_id` is set by the connection-pool wrapper as part of each
request's session. There is no "service account that can see all tenants"
— operational tooling uses tenant-scoped sessions like everything else.

## Layer 2 — Per-tenant schemas for sensitive tables

For the highest-stakes data (audit, MPI), we use per-tenant schemas in
addition to RLS:

- `audit_{tenant_short_id}.events`
- `mpi_{tenant_short_id}.golden_record`
- `mpi_{tenant_short_id}.source_link`
- `mpi_{tenant_short_id}.merge_history`

This means a SQL injection in app code cannot reach across tenants even if
RLS is somehow disabled. The schema name is selected via a connection
parameter, not interpolation, so injection is structurally impossible.

## Layer 3 — Kubernetes namespace + NetworkPolicy

The Vector index (Qdrant), document store, and per-tenant cache live in a
per-tenant Kubernetes namespace. NetworkPolicy:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-cross-tenant
  namespace: leafbridge-tenant-{tenant}
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            leafbridge.dev/tenant: "{tenant}"
      - namespaceSelector:
          matchLabels:
            leafbridge.dev/zone: "control-plane"
  egress:
    - to:
      - namespaceSelector:
          matchLabels:
            leafbridge.dev/tenant: "{tenant}"
      - namespaceSelector:
          matchLabels:
            leafbridge.dev/zone: "control-plane"
```

The "control-plane" namespace holds shared services (identity, policy,
audit) that every tenant calls. Tenant-to-tenant traffic is denied.

## Validation

- **RLS smoke**: every CI run boots Postgres, sets `app.tenant_id` to a
  test tenant, and asserts that queries return zero rows from other
  tenants
- **Schema smoke**: tests use two tenants with distinct schemas and assert
  that explicit cross-schema references are rejected
- **Namespace smoke**: integration test attempts cross-namespace traffic
  and asserts it is dropped at the NetworkPolicy layer
