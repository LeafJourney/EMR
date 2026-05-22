#!/bin/bash
# LeafBridge Swarm Orchestrator
# Dispatches parallel Claude agents to implement and close the remaining LeafBridge tickets.

export PATH="/Users/scottwayman/.hermes/node/bin:$PATH"
mkdir -p .agents/logs

echo "Initializing LeafBridge Swarm Orchestrator..."

# Agent 1: Scaffolding and foundations
echo "Dispatching Agent 1 (Scaffolding & Foundations)..."
nohup claude --permission-mode auto --worktree leafbridge-scaffold -p "Use the linear MCP to fetch and claim the following 6 tickets: EMR-762, EMR-773, EMR-772, EMR-774, EMR-777, EMR-778. Implement the scaffolding, data model, security rules, and specialty templates in the leafbridge/ folder. Make sure the workspace check for no-orphan-components and TS typechecks pass. Commit and push to origin/phase11/leafbridge-scaffold." > .agents/logs/leafbridge_scaffold.log 2>&1 &

# Agent 2: Core Data Services
echo "Dispatching Agent 2 (Core Data Services)..."
nohup claude --permission-mode auto --worktree leafbridge-data-core -p "Use the linear MCP to fetch and claim the following 3 tickets: EMR-763, EMR-764, EMR-765. Implement the Ingestion Gateway, FHIR Persistence Service, and MPI Service in the leafbridge/ folder. Make sure the workspace check for no-orphan-components and TS typechecks pass. Commit and push to origin/phase11/leafbridge-data-core." > .agents/logs/leafbridge_data_core.log 2>&1 &

# Agent 3: AI and Governance
echo "Dispatching Agent 3 (AI & Governance)..."
nohup claude --permission-mode auto --worktree leafbridge-ai-gov -p "Use the linear MCP to fetch and claim the following 3 tickets: EMR-767, EMR-768, EMR-769. Implement the Consent & Policy Gateway, Agent Orchestrator, and Clinical RAG Service in the leafbridge/ folder. Make sure the workspace check for no-orphan-components and TS typechecks pass. Commit and push to origin/phase11/leafbridge-ai-gov." > .agents/logs/leafbridge_ai_gov.log 2>&1 &

echo "All 3 parallel agents successfully dispatched in isolated worktrees. Monitoring..."
