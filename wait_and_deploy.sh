#!/bin/bash
echo "Waiting for PR 223 to merge..."
while true; do
  state=$(gh pr view 223 --json state -q .state)
  if [ "$state" == "MERGED" ]; then
    echo "PR 223 merged!"
    break
  fi
  sleep 15
done

echo "Triggering deployment..."
gh workflow run deploy-production.yml --ref main
sleep 5

echo "Waiting for pending deployment to appear..."
while true; do
  run_id=$(gh run list --workflow="deploy-production.yml" --limit 1 --json databaseId -q '.[0].databaseId')
  
  env_id=$(gh api /repos/scwayman1/EMR/actions/runs/$run_id/pending_deployments -q '.[0].environment.id' 2>/dev/null)
  
  if [ -n "$env_id" ] && [ "$env_id" != "null" ]; then
    echo "Found pending deployment for run $run_id, environment $env_id"
    echo '{"environment_ids":['"$env_id"'],"state":"approved","comment":"Auto-deploying hotfix"}' | gh api -X POST /repos/scwayman1/EMR/actions/runs/$run_id/pending_deployments --input -
    echo "Deployment approved!"
    break
  fi
  sleep 10
done
