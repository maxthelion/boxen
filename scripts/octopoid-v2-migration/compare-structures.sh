#!/bin/bash

echo "=== Directory Structure Comparison ==="
echo ""

if command -v tree >/dev/null 2>&1; then
  echo "v1.x (.orchestrator-v1/):"
  tree -L 2 -d .orchestrator-v1 2>/dev/null || echo "Directory not found"

  echo ""
  echo "v2.0 (.octopoid/):"
  tree -L 2 -d .octopoid 2>/dev/null || echo "Directory not found"
else
  echo "v1.x (.orchestrator-v1/):"
  find .orchestrator-v1 -maxdepth 2 -type d 2>/dev/null | head -20

  echo ""
  echo "v2.0 (.octopoid/):"
  find .octopoid -maxdepth 2 -type d 2>/dev/null | head -20
fi

echo ""
echo "=== Project Management Directories ==="
echo ""
echo "v1.x (pm2/):"
ls -la pm2/ 2>/dev/null || echo "Directory not found"

echo ""
echo "v2.0 (project-management/):"
ls -la project-management/ 2>/dev/null || echo "Directory not found"

echo ""
echo "=== Missing Directories ==="
MISSING=0
for dir in drafts projects breakdowns notes; do
  if [ -d "pm2/$dir" ] && [ ! -d "project-management/$dir" ]; then
    echo "❌ Missing: project-management/$dir (existed in v1.x as pm2/$dir)"
    ((MISSING++))
  fi
done

if [ $MISSING -eq 0 ]; then
  echo "✅ No missing directories"
fi

echo ""
echo "=== Agent Configuration Comparison ==="
echo ""

if command -v yq >/dev/null 2>&1; then
  echo "v1.x agents:"
  yq '.agents[] | .name + " (" + .role + ")"' .orchestrator-v1/agents.yaml 2>/dev/null | head -20

  echo ""
  echo "v2.0 agents:"
  yq '.agents[] | .name + " (" + .role + ")"' .octopoid/agents.yaml 2>/dev/null | head -20
else
  echo "Install 'yq' for detailed agent comparison: brew install yq"
  echo ""
  echo "v1.x agents (grep):"
  grep -E "^\s+name:|^\s+role:" .orchestrator-v1/agents.yaml 2>/dev/null | head -20

  echo ""
  echo "v2.0 agents (grep):"
  grep -E "^\s+name:|^\s+role:" .octopoid/agents.yaml 2>/dev/null | head -20
fi
