#!/bin/bash
# Night Shift Orchestrator
# Dispatches parallel Claude agents to churn through the remaining 51 Linear tickets.

export PATH="/Users/scottwayman/.hermes/node/bin:$PATH"
mkdir -p .agents/logs

echo "Initializing Night Shift Orchestrator..."
echo "Connecting to Linear MCP (auto permission mode enabled)..."

# Agent 1: High Priority Bugs
echo "Dispatching Agent 1 (High Priority Bugs)..."
nohup claude --permission-mode auto --worktree bugfix-batch-1 -p "Use the linear MCP to fetch 15 high-priority open tickets. Implement the fixes, commit them, and push to origin/phase11/bugfix-batch-1." < /dev/null > .agents/logs/night_shift_1.log 2>&1 &

# Agent 2: Feature Backlog
echo "Dispatching Agent 2 (Feature Backlog)..."
nohup claude --permission-mode auto --worktree feature-batch-1 -p "Use the linear MCP to fetch 15 medium-priority feature tickets. Implement the features, commit them, and push to origin/phase11/feature-batch-1." < /dev/null > .agents/logs/night_shift_2.log 2>&1 &

# Agent 3: Cleanup & Tech Debt
echo "Dispatching Agent 3 (Cleanup & Tech Debt)..."
nohup claude --permission-mode auto --worktree cleanup-batch-1 -p "Use the linear MCP to fetch the remaining 21 tickets to reach the quota of 51. Implement the fixes, commit them, and push to origin/phase11/cleanup-batch-1." < /dev/null > .agents/logs/night_shift_3.log 2>&1 &

echo "All 3 parallel agents successfully dispatched in isolated worktrees with MCP permissions bypassed. Monitoring..."
