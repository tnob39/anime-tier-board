# Claude Code — Project Instructions

You are working on **anime-tier-board** inside Orca ADE (or a linked worktree).

## Required reading (before any action)

1. **[docs/orchestration/AGENT_EXECUTION_CONTRACT.md](./docs/orchestration/AGENT_EXECUTION_CONTRACT.md)** — Contract v1.0; canonical roles, ACK, handoffs, proof and recovery
2. **[ORCA_GUIDE.md](./ORCA_GUIDE.md)** — Orca worktrees, terminals, diff review, multi-agent rules
3. **[AGENTS.md](./AGENTS.md)** — Project structure, conventions, APIs, verification
4. **[docs/GITHUB_ISSUES.md](./docs/GITHUB_ISSUES.md)** — Task tracking (GitHub Issues)

For the active task, also read the relevant file under `plans/` or `HERMES_GROK_HANDOFF.md`.

## Orca rules (always follow)

```
You are operating inside Orca ADE. Before acting, read and follow ORCA_GUIDE.md.
Use separate worktrees for parallel subtasks. Prefer `orca` CLI over raw git worktree
when Orca state matters. Update worktree comments at checkpoints. For structured
multi-agent work, use orchestration (not ad-hoc terminal polling).
```

## Quick constraints

- Before claim or edits, return the contract v1.0 ACK JSON and validate it with `python scripts/validate-orchestration-ack.py --agent <agent> <ack-file>`.
- Fable is the non-coding Architect/Reviewer; Grok 4.5 is the bounded Implementer; Hermes independently collects proof. Do not collapse these roles into one self-reviewing conversation.
- Do not commit the untracked `Hermes` file unless the user explicitly asks.
- Run `npx tsc --noEmit` and `npm run build` before finishing implementation work.
- Update the GitHub Issue and worktree comment when task status changes.
- Leave review feedback via Orca diff annotations when possible.

## Worktree-specific guides

- **composer-dev**: [worktrees/composer-dev.md](./worktrees/composer-dev.md)
- **claude-review**: [worktrees/claude-review.md](./worktrees/claude-review.md)

## Automations

Scheduled review prompts are defined in [orca/AUTOMATIONS.md](./orca/AUTOMATIONS.md).