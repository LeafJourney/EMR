# LeafBridge apps

User-facing applications. Each app is a Next.js project consuming the
LeafBridge services and SDKs from `../packages/`.

| App | Audience | Phase |
| -- | -- | -- |
| `admin-console` | Platform operators (tenants, modalities, agent registry) | Phase 5 |
| `agent-workbench` | Clinicians reviewing agent output | Phase 4 |
| `mission-control-demo` | Reference dashboard wiring everything together | Phase 5 |

Apps must never reach into another app's source — share via `../packages/`.
