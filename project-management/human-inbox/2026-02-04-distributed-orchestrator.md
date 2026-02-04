# Multi-Machine Orchestrator Coordination

**Date:** 2026-02-04
**Type:** Architecture discussion

## Problem

Current orchestrator assumes single machine - filesystem locks, local PIDs, shared queue directory. What would it take to run agents across multiple machines?

## Core Challenge

Distributed locking without a central coordinator. Two machines need to agree on who owns a task.

## Options Considered

1. **Git-based locking** - Use remote branches as locks. `git push` is atomic, first to push wins. Need heartbeat mechanism for stale lock detection.

2. **GitHub Issues as queue** - Let GitHub handle coordination. Claim = assign issue. Built-in but adds API dependency/latency.

3. **External service** - Redis SETNX, PostgreSQL row locking, etcd leases. Most robust but requires infrastructure.

## Key Complexity: Stale Locks

If a machine claims a task then crashes, how do others know to reclaim it?
- Heartbeat files with timestamps
- TTL-based leases
- Manual intervention

## Questions to Discuss

- Is multi-machine actually needed? Or is one beefy machine sufficient?
- If needed, what's acceptable complexity?
- Git-based approach: Good enough for low contention (few machines, long tasks)?
- Worth the added failure modes?

## Related

- Current bugs (worktree reset, stale state) should be fixed first on single-machine before adding distribution complexity
