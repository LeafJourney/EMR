#!/bin/bash
# Linear MCP Cleanup Agent
# Auto-closes the 129 tickets we completed across Phase 10 and Phase 11

echo "Initializing Linear MCP Ticket Cleanup..."
echo "Connecting to linear-server MCP with auto-permissions..."

export PATH="/Users/scottwayman/.hermes/node/bin:$PATH"

nohup claude --permission-mode auto -p "Use the linear MCP to search for all open tickets associated with Phase 10 and Phase 11 (the 129 tickets we shipped over the last 24 hours). Transition their state to 'Done'. Ensure you do NOT close any of the 16 newly created tickets." < /dev/null > .agents/logs/linear_cleanup.log 2>&1 &

echo "Cleanup agent successfully dispatched. It is now closing tickets in the background."
