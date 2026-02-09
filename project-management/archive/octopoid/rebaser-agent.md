# Rebaser Agent

**Status:** Idea
**Captured:** 2026-02-08

## Raw

> a new kind of agent called a rebaser. Orchestrator looks at the items for review and checks if they are falling behind main. If they are, rebaser agent fires up to get them up to speed.

## Idea

A new agent role called a "rebaser." The orchestrator monitors tasks in the review queue and checks whether their branches have fallen behind main. If they have, the rebaser agent fires up to rebase them and get them up to date — so by the time a human reviews, the work is current and mergeable.

## Context

Tasks can sit in provisional/review for a while, especially when multiple agents are producing work. Meanwhile main moves forward (other PRs merge, submodule updates land). By the time the human reviews, the branch may be stale, leading to merge conflicts or divergence concerns. Currently this is flagged manually during review, which slows things down.

## Open Questions

- Should the rebaser also re-run tests after rebasing, or leave that to the gatekeeper?

yes 

- What happens if the rebase has conflicts — does it escalate to the implementing agent, or to the human?

make a determination. if trivial fix, if difficult, escalate (I'm not sure we have a good escalation mechanism)

- Should it rebase proactively (on a schedule) or only when a task is about to be reviewed?

proactively

- Does it apply to orchestrator_impl tasks too (submodule rebasing is trickier)?

Maybe in a second version.

## Possible Next Steps

- Define the rebaser role and add it to agents.yaml
- Implement as a lightweight agent that checks branch freshness on provisional tasks -- no, scheduler
- Could be a scheduler-level check rather than a full agent (no LLM needed for a simple rebase) -- yes, scheduler checks manually, flags a row in the db for rebase.


Let's:

- Create the agent that does the work
- change scheduler so that it launches agent if a task is marked as stale
- make a script to mark a task as requiring rebase that we can run manually





