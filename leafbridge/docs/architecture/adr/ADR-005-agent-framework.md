# ADR-005: LeafBridge agent framework + orchestrator boundary

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
Agents are first-class participants in clinical workflows: they read
charts, suggest changes, and surface findings to clinicians. We need a
shared substrate so agents can be tested, composed, and audited
uniformly — and a clear boundary between "the agent" and "the system
that runs it."

## Decision
Agents implement a typed `Agent<Input, Output>` contract. The
orchestrator (a separate module) is responsible for: routing
inputs, materializing tool calls, retry/backoff, surfacing outputs to
the review queue, and writing one `LlmUsage` row per upstream call.
Agents must not call the model client directly — they call the
broker ([[ADR-005]] cousin spec, EMR-754).

## Consequences
- Pro: agent code is small, declarative, and unit-testable.
- Pro: cost + audit is centralized.
- Con: orchestrator is a hot path with a wide blast radius.
- Con: agent authors must learn the contract rather than ad-hoc scripts.

## Alternatives considered
- Per-agent direct model client calls. Rejected: no centralized accounting.
- Embedded LangGraph-style DAGs per agent. Deferred: pick up when more
  than ~5 agents need conditional composition.
