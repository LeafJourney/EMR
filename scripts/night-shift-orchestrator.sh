#!/bin/bash

# Night Shift Orchestrator
# This script runs through the 30 prepared swarm branches sequentially.
# It uses the Claude CLI to automatically execute the agent prompt in each branch,
# run verification, and push the PR.
# 
# PREREQUISITES:
# You must have the Anthropic Claude CLI installed and authenticated.

echo "🌙 Starting Epic 30-Agent Night Shift Sequence..."

git checkout main
git pull origin main

for i in {1..30}; do
    # Format the branch number with leading zero
    NUM=$(printf "%02d" $i)
    
    # Find the matching branch
    BRANCH=$(git branch -a | grep "feat/swarm-$NUM" | awk '{print $1}' | sed 's/remotes\/origin\///' | head -n 1)
    
    # Clean up whitespace
    BRANCH=$(echo "$BRANCH" | xargs)
    
    if [ -z "$BRANCH" ]; then
        echo "⚠️ Could not find branch for $NUM. Skipping."
        continue
    fi
    
    echo "=========================================================="
    echo "🚀 DISPATCHING AGENT $NUM on branch $BRANCH"
    echo "=========================================================="
    
    # Switch to the branch
    git checkout $BRANCH
    
    if [ ! -f ".agent-prompt.md" ]; then
        echo "⚠️ No .agent-prompt.md found in $BRANCH. Skipping."
        continue
    fi
    
    PROMPT=$(cat .agent-prompt.md)
    
    # Run the Claude CLI with the prompt, telling it to execute autonomously
    # We pipe the prompt to Claude. Depending on the exact CLI tool you use, 
    # you might need to adjust this command. Assuming Anthropic's official or 
    # a similar interactive CLI that supports -p (prompt) or stdin.
    
    echo "Executing Claude..."
    # We pass an explicit instruction to do the work and exit.
    claude -p "$PROMPT. When finished, run typecheck, lint, commit, and push. Then say 'TASK_COMPLETE' and exit."
    
    echo "✅ Agent $NUM completed."
    sleep 5
done

git checkout main
echo "☀️ Good morning! The Night Shift has completed 30 tasks."
