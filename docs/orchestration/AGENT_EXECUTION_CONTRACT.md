# Agent Execution Contract

Contract version: **1.0**
Status: **canonical**
Scope: `tnob39/anime-tier-board`

This file is the single source of truth for multi-agent execution. Runtime-specific instructions must point here and must not maintain divergent role copies.

## 1. Mandatory loop

```text
GOAL → SPEC → CLAIM → WORKTREE → EXECUTE → PROOF → REVIEW → PR → MERGE → CLEANUP → NEXT
```

No dependent task starts before the current task is accepted. GitHub Issues/PRs are the backlog and task-state source of truth. Orca is the execution plane, not a competing backlog.

## 2. Roles

| Agent/runtime | Required role | Owns | Must not do |
|---|---|---|---|
| vmes | `MASTER_HUB` | 24/7 queue, ready checks, dispatch, durable state, notifications | Edit Windows-local files; replace Grok 4.5 with another model |
| loher | `LOCAL_OPERATOR` | Windows/Orca/CLI execution, local dispatch, PR and browser operations, state return | Create a second source of truth; accept self-reported proof |
| Fable 5 via Claude Code | `ARCHITECT_REVIEWER` | Observable completion, dependency DAG, one strict atomic JSON Spec, evidence review | Write implementation code; review implementer claims without evidence |
| Grok 4.5 | `PURE_IMPLEMENTER` | Implement exactly one accepted atomic Spec | Redesign, broaden scope, edit forbidden files, merge, deploy, invent missing policy |
| Hermes | `PROOF_COLLECTOR` | Isolation checks, actual diff/file readback, independent commands, evidence bundle | Treat `DONE`, prose, PID, or exit code alone as proof |
| Codex | `SELECTIVE_REVIEWER` | Independent review for high-risk/large/ambiguous changes | Start a separate implementation; expand the verified scope |
| Orca | execution plane | One atomic task per isolated worktree, lineage, terminals, comments, browser | Replace GitHub Issues as backlog |
| Nobu | Product Owner | Product decisions and human-only authorization | Routine decomposition, test execution, or reviewer coordination |

Coding/orchestration tasks use **Grok 4.5**. If unavailable on vmes, vmes dispatches to loher; it does not downgrade the model.

## 3. Atomic Spec

Fable emits only the next ready task. Required fields:

```json
{
  "task_id": "ATB-447-E1",
  "goal": "One observable outcome",
  "depends_on": [],
  "exact_constraints": [],
  "input_files": [],
  "allowed_files": [],
  "forbidden_files": [],
  "required_changes": [],
  "acceptance_criteria": [],
  "validation_commands": [],
  "expected_output_format": {},
  "failure_protocol": {}
}
```

Rules:

- Prefer 1–3 owned files; more than 5 requires a reason.
- Do not mix UI, API, and migration unless inseparable.
- Do not generate future dependent Specs in advance.
- Ambiguity, contradiction, missing dependency, or forbidden-file need returns `BLOCKED`; the implementer must not guess.

## 4. Pre-execution acknowledgement

Before edits or claims, every participant returns JSON matching this shape:

```json
{
  "contract_version": "1.0",
  "agent": "grok",
  "role": "PURE_IMPLEMENTER",
  "task_id": "ATB-447-E1",
  "allowed_files": [],
  "forbidden_files": [],
  "previous_handoff": "FABLE_SPEC",
  "next_handoff": "HERMES_PROOF",
  "stop_conditions": ["scope conflict", "missing dependency"],
  "required_evidence": ["verified diff", "actual command output"],
  "acknowledged": true
}
```

Expected role and handoff matrix:

| agent | role | previous_handoff | next_handoff |
|---|---|---|---|
| `vmes` | `MASTER_HUB` | `GITHUB_ISSUE` | `LOHER_DISPATCH` |
| `loher` | `LOCAL_OPERATOR` | `VMES_DISPATCH` | `VMES_STATE_RETURN` |
| `fable` | `ARCHITECT_REVIEWER` | `HERMES_INTAKE_OR_PROOF` | `HERMES_CLAIM_OR_DECISION` |
| `grok` | `PURE_IMPLEMENTER` | `FABLE_SPEC` | `HERMES_PROOF` |
| `hermes` | `PROOF_COLLECTOR` | `GROK_RESULT` | `FABLE_REVIEW` |
| `codex` | `SELECTIVE_REVIEWER` | `HERMES_PROOF` | `FABLE_FINAL_DECISION` |

Validate ACK before execution:

```bash
python scripts/validate-orchestration-ack.py --agent grok path/to/ack.json
```

Invalid ACK means no edits, no claim, and redispatch with the same bounded Spec.

## 5. Execution and proof

1. Hermes checks Issue state, duplicate claims, dependencies, and `origin/main` SHA.
2. Hermes claims the Issue with session ID and worktree name.
3. Orca creates one clean worktree from `origin/main`; verify path, branch, baseRef, lineage, clean status, and agent cwd.
4. Grok receives only the pure-implementer contract, atomic Spec, and required input files.
5. Hermes independently checks:
   - `git status --short`
   - `git diff --name-only` and allowed/forbidden scope
   - changed-section readback
   - `git diff --check`
   - mojibake and harness artifacts
   - target tests, `npx tsc --noEmit`, `npm.cmd run build`
   - browser/Vercel evidence when required
6. Fable receives only original Spec, verified diff, actual commands/exit codes, and blockers.
7. Fable returns exactly `ACCEPTED`, `FIX_SPEC`, `REPLAN`, or `BLOCKED`.
8. Codex reviews only when auth/DB/concurrency/security, large diff, interpretation conflict, or independent type/testability review warrants it.

## 6. Transport and recovery

Target topology:

```text
GitHub Issue → vmes → loher → Fable/Grok/Hermes/Codex/Orca → loher → vmes
```

Until agent-bus transport is operational, direct SSH is an explicit degraded transport. The dispatch envelope must still contain contract version, task ID, Spec, claim/session ID, and reply target.

Retry rules:

- After two unchanged-path failures, shrink the Spec or switch permitted execution path.
- After three failures, return `REPLAN`; do not retry indefinitely.
- After wrapper termination, inspect child processes and actual diff.
- Product ambiguity, auth/secret need, destructive action, or unresolved conflict returns `BLOCKED` with minimum decision needed.

## 7. Readiness levels

- `PLANNED`: contract exists.
- `DISTRIBUTED`: every runtime can discover version 1.0.
- `ACK_VERIFIED`: read-only comprehension and ACK validation pass for every runtime.
- `TRANSPORT_READY`: dispatch, claim, state return, and restart path work.
- `OPERATIONAL`: one low-risk atomic task completes end-to-end with independent proof and Fable acceptance.

Only `OPERATIONAL` may be reported as unqualified **整備済み**.
