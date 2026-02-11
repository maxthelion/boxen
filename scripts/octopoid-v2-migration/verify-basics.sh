#!/bin/bash

check() {
  if eval "$2" >/dev/null 2>&1; then
    echo "✅ $1"
    return 0
  else
    echo "❌ $1"
    return 1
  fi
}

echo "=== Basic v2.0 Verification ==="
echo ""

PASS=0
FAIL=0

check "octopoid command exists" "which octopoid || which npx" && ((PASS++)) || ((FAIL++))
check "Can run octopoid --version" "npx octopoid --version" && ((PASS++)) || ((FAIL++))
check ".octopoid directory created" "[ -d .octopoid ]" && ((PASS++)) || ((FAIL++))
check "agents.yaml exists" "[ -f .octopoid/agents.yaml ]" && ((PASS++)) || ((FAIL++))
check "Can create task" "npx octopoid task create 'test' --role implement --dry-run" && ((PASS++)) || ((FAIL++))
check "Can list queue" "npx octopoid queue list --help" && ((PASS++)) || ((FAIL++))
check "Can check status" "npx octopoid status --help" && ((PASS++)) || ((FAIL++))

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ $FAIL -eq 0 ]; then
  echo "🎉 All basic checks passed!"
  exit 0
else
  echo "⚠️  Some checks failed - see above"
  exit 1
fi
