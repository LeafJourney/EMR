// Inbound Message Gateway (EMR-1145) — multi-channel funnel into the UPI
// triage engine. See ./normalize.ts (shape), ./ingest.ts (pipeline) and
// ./auto-reply.ts (urgent 911/ED safety reply, spec Phase 4.1).

export * from "./normalize";
export * from "./ingest";
export * from "./auto-reply";
