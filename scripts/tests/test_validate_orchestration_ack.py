import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "validate-orchestration-ack.py"


def load_validator():
    spec = importlib.util.spec_from_file_location("ack_validator", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("validator could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AckValidatorTests(unittest.TestCase):
    def setUp(self):
        self.validator = load_validator()
        self.valid = {
            "contract_version": "1.0",
            "agent": "grok",
            "role": "PURE_IMPLEMENTER",
            "task_id": "ATB-447-E1",
            "allowed_files": ["app/api/home/route.ts"],
            "forbidden_files": ["db/migrations/**"],
            "previous_handoff": "FABLE_SPEC",
            "next_handoff": "HERMES_PROOF",
            "stop_conditions": ["scope conflict", "missing dependency"],
            "required_evidence": ["verified diff", "actual command output"],
            "acknowledged": True,
        }

    def test_accepts_matching_grok_ack(self):
        self.assertEqual([], self.validator.validate_ack(self.valid, "grok"))

    def test_rejects_wrong_role_and_handoff(self):
        ack = {**self.valid, "role": "ARCHITECT", "next_handoff": "PR_MERGE"}
        errors = self.validator.validate_ack(ack, "grok")
        self.assertTrue(any("role" in error for error in errors))
        self.assertTrue(any("next_handoff" in error for error in errors))

    def test_rejects_unknown_contract_and_missing_scope(self):
        ack = {**self.valid, "contract_version": "0.9"}
        del ack["allowed_files"]
        errors = self.validator.validate_ack(ack, "grok")
        self.assertTrue(any("contract_version" in error for error in errors))
        self.assertTrue(any("allowed_files" in error for error in errors))

    def test_rejects_unacknowledged_or_empty_stop_conditions(self):
        ack = {**self.valid, "acknowledged": False, "stop_conditions": []}
        errors = self.validator.validate_ack(ack, "grok")
        self.assertTrue(any("acknowledged" in error for error in errors))
        self.assertTrue(any("stop_conditions" in error for error in errors))

    def test_rejects_non_string_array_entries_without_crashing(self):
        ack = {**self.valid, "allowed_files": [{"unexpected": "object"}]}
        errors = self.validator.validate_ack(ack, "grok")
        self.assertTrue(any("allowed_files" in error for error in errors))

    def test_cli_returns_nonzero_for_invalid_ack(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as handle:
            json.dump({**self.valid, "role": "ARCHITECT"}, handle)
            path = handle.name
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--agent", "grok", path],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        Path(path).unlink(missing_ok=True)
        self.assertEqual(1, result.returncode)
        self.assertIn("INVALID", result.stdout)


if __name__ == "__main__":
    unittest.main()
