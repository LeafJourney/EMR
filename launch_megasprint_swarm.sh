#!/bin/bash
# Megasprint Swarm Orchestrator
# Dispatches 4 parallel agents (3 Claude Code tracks, 1 Codex track) using Git worktrees.

export PATH="/Users/scottwayman/.hermes/node/bin:/usr/local/bin:$PATH"
mkdir -p .agents/logs

echo "===================================================================="
echo "🌱 Dispatched Megasprint Swarm (4 Tracks, 200 Cards) 🌱"
echo "===================================================================="

cd /Users/scottwayman/EMR

# Clean up stale worktrees first
git worktree prune

# Track 1: Patient Portal & Wellness (Claude Code A)
echo "Dispatching Track 1 (Patient Portal & Wellness)..."
nohup claude --permission-mode auto --worktree sprint-ms-1 -p "You are assigned to Megasprint Track 1: Patient Portal & Wellness. Use the Linear MCP to fetch and implement these 50 tickets:
EMR-910, EMR-909, EMR-905, EMR-386, EMR-385, EMR-384, EMR-383, EMR-378, EMR-375, EMR-374, EMR-371, EMR-339, EMR-328, EMR-289, EMR-288, EMR-314, EMR-313, EMR-545, EMR-536, EMR-556, EMR-554, EMR-525, EMR-538, EMR-522, EMR-558, EMR-557, EMR-553, EMR-544, EMR-543, EMR-542, EMR-541, EMR-540, EMR-539, EMR-537, EMR-535, EMR-534, EMR-533, EMR-532, EMR-531, EMR-530, EMR-529, EMR-528, EMR-526, EMR-524, EMR-523, EMR-521, EMR-520, EMR-519, EMR-517, EMR-516.

Work strictly in src/app/(patient)/portal/, src/app/shop/, src/app/vendor/, and src/components/store/. Avoid editing shared layout files or database schemas. Ensure you run typechecks and tests before committing. Commit and push your changes to origin/sprint-ms-1." < /dev/null > .agents/logs/sprint_ms_1.log 2>&1 &

# Track 2: Clinician Workspace & SOAP EMR (Claude Code B)
echo "Dispatching Track 2 (Clinician Workspace & SOAP EMR)..."
nohup claude --permission-mode auto --worktree sprint-ms-2 -p "You are assigned to Megasprint Track 2: Clinician Workspace & SOAP EMR. Use the Linear MCP to fetch and implement these 50 tickets:
EMR-902, EMR-901, EMR-900, EMR-899, EMR-897, EMR-896, EMR-895, EMR-894, EMR-893, EMR-892, EMR-891, EMR-889, EMR-888, EMR-887, EMR-886, EMR-885, EMR-884, EMR-883, EMR-882, EMR-881, EMR-880, EMR-879, EMR-878, EMR-877, EMR-876, EMR-875, EMR-874, EMR-873, EMR-872, EMR-871, EMR-870, EMR-869, EMR-868, EMR-866, EMR-865, EMR-864, EMR-863, EMR-862, EMR-861, EMR-860, EMR-859, EMR-858, EMR-856, EMR-855, EMR-854, EMR-852, EMR-851, EMR-850, EMR-849, EMR-848.

Work strictly in src/app/(clinician)/clinic/ and src/lib/clinical/. Avoid editing shared layout files or database schemas. Ensure you run typechecks and tests before committing. Commit and push your changes to origin/sprint-ms-2." < /dev/null > .agents/logs/sprint_ms_2.log 2>&1 &

# Track 3: Practice Operations & Billing (Claude Code C)
echo "Dispatching Track 3 (Practice Operations & Billing)..."
nohup claude --permission-mode auto --worktree sprint-ms-3 -p "You are assigned to Megasprint Track 3: Practice Operations & Billing. Use the Linear MCP to fetch and implement these 50 tickets:
EMR-986, EMR-985, EMR-984, EMR-983, EMR-982, EMR-981, EMR-980, EMR-979, EMR-978, EMR-977, EMR-976, EMR-975, EMR-973, EMR-972, EMR-971, EMR-970, EMR-968, EMR-967, EMR-966, EMR-965, EMR-964, EMR-963, EMR-962, EMR-961, EMR-956, EMR-955, EMR-954, EMR-953, EMR-952, EMR-950, EMR-949, EMR-948, EMR-947, EMR-946, EMR-945, EMR-944, EMR-943, EMR-942, EMR-941, EMR-938, EMR-937, EMR-936, EMR-935, EMR-934, EMR-933, EMR-932, EMR-931, EMR-930, EMR-928, EMR-927.

Work strictly in src/app/(operator)/ops/ and src/lib/billing/. Avoid editing shared layout files or database schemas. Ensure you run typechecks and tests before committing. Commit and push your changes to origin/sprint-ms-3." < /dev/null > .agents/logs/sprint_ms_3.log 2>&1 &

# Track 4: Infrastructure, Compliance & APIs (Codex Track)
echo "Dispatching Track 4 (Infrastructure & APIs - Codex)..."
nohup claude --permission-mode auto --worktree sprint-ms-4 -p "You are assigned to Megasprint Track 4 (Codex): Infrastructure, Compliance, DB Schemas & APIs. Use the Codex agent guidelines to fetch and implement these 50 tickets:
EMR-974, EMR-969, EMR-960, EMR-958, EMR-951, EMR-940, EMR-788, EMR-790, EMR-789, EMR-411, EMR-409, EMR-408, EMR-410, EMR-407, EMR-472, EMR-471, EMR-470, EMR-441, EMR-428, EMR-724, EMR-723, EMR-421, EMR-636, EMR-635, EMR-633, EMR-632, EMR-629, EMR-628, EMR-627, EMR-625, EMR-622, EMR-621, EMR-619, EMR-618, EMR-581, EMR-580, EMR-582, EMR-469, EMR-457, EMR-456, EMR-453, EMR-444, EMR-439, EMR-438, EMR-436, EMR-435, EMR-434, EMR-430, EMR-429, EMR-418.

Work strictly in prisma/, src/lib/db/, src/lib/rbac/, src/middleware.ts, and API folders under src/app/api/. Ensure you run typechecks and tests before committing. Commit and push your changes to origin/sprint-ms-4." < /dev/null > .agents/logs/sprint_ms_4.log 2>&1 &

echo "===================================================================="
echo "✅ All 4 parallel tracks successfully launched!"
echo "Monitor log outputs via:"
echo "  tail -f .agents/logs/sprint_ms_1.log"
echo "  tail -f .agents/logs/sprint_ms_2.log"
echo "  tail -f .agents/logs/sprint_ms_3.log"
echo "  tail -f .agents/logs/sprint_ms_4.log"
echo "===================================================================="
