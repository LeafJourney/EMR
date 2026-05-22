# AuditEvent

**Profile:** base FHIR R4 + LeafBridge extensions for agent context.

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `type` | 1..1 | DICOM audit-event-type or HL7 audit-event-type |
| `subtype` | 0..* | finer-grained event type |
| `action` | 1..1 | `C`, `R`, `U`, `D`, `E` |
| `recorded` | 1..1 | timestamp |
| `outcome` | 1..1 | `0` success, `4` minor, `8` serious, `12` major |
| `agent` | 1..* | Who acted. Each agent has `type`, `who`, `requestor` |
| `source.observer` | 1..1 | Which service emitted the event |
| `entity` | 0..* | What was touched (Reference + entity.role) |

## LeafBridge extensions

| Extension | Purpose |
| -- | -- |
| `leafbridge-agent-prompt` | Agent prompt + tool calls + outputs (only set when `agent.type=agent`) |
| `leafbridge-policy-decision` | Allow/deny + policy hash + decision inputs (only set on policy-gateway events) |
| `leafbridge-tenant-id` | Tenant scoping; redundant with the Provenance target but cheaper to filter |

## Append-only constraint

Database grants:

```sql
revoke update, delete on auditevent from leafbridge_app;
```

Read access is per-tenant via row-level security. Operations team gets
counts and timings via Prometheus, never raw event content.

## Search parameters (MVP)

See [../search-parameter-matrix.md#auditevent](../search-parameter-matrix.md#auditevent).

## Validation rules

1. `agent.type = agent` requires the `leafbridge-agent-prompt` extension.
2. `subtype.code = policy-decision` requires the
   `leafbridge-policy-decision` extension.
3. `tenant_id` must match the tenant of every referenced entity.

## Example

[`examples/fhir-resources/AuditEvent.example.json`](../../../examples/fhir-resources/AuditEvent.example.json)
