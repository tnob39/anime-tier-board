#!/usr/bin/env python
"""Validate pre-execution acknowledgements for orchestration contract v1.0."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

CONTRACT_VERSION = "1.0"
AGENT_CONTRACTS = {
    "fable": ("ARCHITECT_REVIEWER", "HERMES_INTAKE_OR_PROOF", "HERMES_CLAIM_OR_DECISION"),
    "grok": ("PURE_IMPLEMENTER", "FABLE_SPEC", "HERMES_PROOF"),
    "hermes": ("PROOF_COLLECTOR", "GROK_RESULT", "FABLE_REVIEW"),
    "codex": ("SELECTIVE_REVIEWER", "HERMES_PROOF", "FABLE_FINAL_DECISION"),
    "vmes": ("MASTER_HUB", "GITHUB_ISSUE", "LOHER_DISPATCH"),
    "loher": ("LOCAL_OPERATOR", "VMES_DISPATCH", "VMES_STATE_RETURN"),
}
REQUIRED_FIELDS = {
    "contract_version": str,
    "agent": str,
    "role": str,
    "task_id": str,
    "allowed_files": list,
    "forbidden_files": list,
    "previous_handoff": str,
    "next_handoff": str,
    "stop_conditions": list,
    "required_evidence": list,
    "acknowledged": bool,
}


def validate_ack(ack: Any, expected_agent: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(ack, dict):
        return ["ack must be a JSON object"]
    if expected_agent not in AGENT_CONTRACTS:
        return [f"unsupported agent: {expected_agent}"]

    for field, expected_type in REQUIRED_FIELDS.items():
        if field not in ack:
            errors.append(f"missing field: {field}")
        elif not isinstance(ack[field], expected_type):
            errors.append(f"{field} must be {expected_type.__name__}")

    role, previous_handoff, next_handoff = AGENT_CONTRACTS[expected_agent]
    expected_values = {
        "contract_version": CONTRACT_VERSION,
        "agent": expected_agent,
        "role": role,
        "previous_handoff": previous_handoff,
        "next_handoff": next_handoff,
    }
    for field, expected in expected_values.items():
        if field in ack and isinstance(ack[field], str) and ack[field] != expected:
            errors.append(f"{field} must be {expected!r}, got {ack[field]!r}")

    if isinstance(ack.get("task_id"), str) and not ack["task_id"].strip():
        errors.append("task_id must not be empty")
    if isinstance(ack.get("stop_conditions"), list) and not ack["stop_conditions"]:
        errors.append("stop_conditions must not be empty")
    if isinstance(ack.get("required_evidence"), list) and not ack["required_evidence"]:
        errors.append("required_evidence must not be empty")
    if ack.get("acknowledged") is not True:
        errors.append("acknowledged must be true")
    for field in ("allowed_files", "forbidden_files", "stop_conditions", "required_evidence"):
        value = ack.get(field)
        if isinstance(value, list) and any(not isinstance(item, str) for item in value):
            errors.append(f"{field} entries must be strings")

    if isinstance(ack.get("allowed_files"), list) and isinstance(ack.get("forbidden_files"), list):
        allowed = [item for item in ack["allowed_files"] if isinstance(item, str)]
        forbidden = [item for item in ack["forbidden_files"] if isinstance(item, str)]
        if set(allowed) & set(forbidden):
            errors.append("allowed_files and forbidden_files must not overlap")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("ack_file", type=Path)
    parser.add_argument("--agent", required=True, choices=sorted(AGENT_CONTRACTS))
    args = parser.parse_args()

    try:
        ack = json.loads(args.ack_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"INVALID: {exc}")
        return 1

    errors = validate_ack(ack, args.agent)
    if errors:
        print("INVALID")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"VALID: {args.agent} acknowledged contract {CONTRACT_VERSION} for {ack['task_id']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
