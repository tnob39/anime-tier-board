import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = ROOT / "scripts" / "validate-orchestration-ack.py"


def load_validator():
    spec = importlib.util.spec_from_file_location("ack_validator_distribution", VALIDATOR)
    if spec is None or spec.loader is None:
        raise RuntimeError("validator could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ContractDistributionTests(unittest.TestCase):
    def test_agents_adapter_matches_validator_role_and_handoffs(self):
        validator = load_validator()
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("Contract version: `1.0`", agents)
        for agent, (role, previous, next_handoff) in validator.AGENT_CONTRACTS.items():
            expected_row = f"| `{agent}` | `{role}` | `{previous}` | `{next_handoff}` |"
            self.assertIn(expected_row, agents)

    def test_runtime_entry_points_reference_the_canonical_contract(self):
        canonical = "docs/orchestration/AGENT_EXECUTION_CONTRACT.md"
        for entry_point in ("AGENTS.md", "CLAUDE.md"):
            text = (ROOT / entry_point).read_text(encoding="utf-8")
            self.assertIn(canonical, text)

    def test_contract_and_validator_versions_match(self):
        validator = load_validator()
        contract = (ROOT / "docs/orchestration/AGENT_EXECUTION_CONTRACT.md").read_text(encoding="utf-8")
        self.assertIn(f"Contract version: **{validator.CONTRACT_VERSION}**", contract)


if __name__ == "__main__":
    unittest.main()
