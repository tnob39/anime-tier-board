import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDefaultEvaluationCases,
  createFixtureRecognitionAdapter,
  jsonContainsRawImage,
  runEvaluationHarness,
} from "../lib/anime-recognition/index.ts";
import type {
  EvaluationCase,
  RecognitionAdapter,
  RecognitionCandidate,
  RecognitionInput,
  RecognitionResult,
} from "../lib/anime-recognition/index.ts";

function fakeCandidate(title = "Unexpected Title"): RecognitionCandidate {
  return {
    title,
    episode: null,
    from: null,
    to: null,
    confidence: 0.5,
    source: "fixture",
    provenance: {
      adapter: "fixture",
      fixtureId: "fake",
      sourceId: "fixture",
      retrievedAtMs: 0,
    },
  };
}

function scriptedAdapter(resultsByFixtureId: Record<string, RecognitionResult>): RecognitionAdapter {
  return {
    name: "fixture",
    recognize(input: RecognitionInput) {
      const id = input.kind === "fixture" ? input.fixtureId : "binary";
      const result = resultsByFixtureId[id];
      if (!result) {
        throw new Error(`missing scripted result for ${id}`);
      }
      return result;
    },
  };
}

function fixtureCase(
  id: string,
  scenario: EvaluationCase["scenario"],
  expectedStatus: EvaluationCase["expectedStatus"],
): EvaluationCase {
  return {
    id,
    scenario,
    input: { kind: "fixture", fixtureId: id },
    expectedStatus,
  };
}

test("metrics harness is deterministic and covers required scenarios", () => {
  const adapter = createFixtureRecognitionAdapter();
  const cases = buildDefaultEvaluationCases();
  const scenarios = new Set(cases.map((item) => item.scenario));
  for (const required of [
    "known_match",
    "no_match",
    "ambiguous",
    "malformed",
    "oversized",
    "timeout",
    "provider_failure",
  ]) {
    assert.ok(scenarios.has(required as (typeof cases)[number]["scenario"]), required);
  }

  const first = runEvaluationHarness(adapter, cases);
  const second = runEvaluationHarness(adapter, cases);
  assert.deepEqual(first, second);
  assert.equal(first.adapter, "fixture");
  assert.equal(first.externalRuntimeEnabled, false);
  assert.equal(first.caseCount, 7);
  assert.equal(first.top1Hits, 1);
  assert.equal(first.top1Eligible, 1);
  assert.equal(first.top1Precision, 1);
  assert.equal(first.top3Hits, 2);
  assert.equal(first.top3Eligible, 2);
  assert.equal(first.top3Precision, 1);
  assert.equal(first.statusHits, 7);
  assert.equal(first.statusMismatches, 0);
  assert.equal(first.falsePositives, 0);
  assert.equal(first.falsePositiveEligible, 5);
  assert.equal(first.falsePositiveRate, 0);
  assert.equal(first.byScenario.known_match.statusHits, 1);
  assert.equal(first.byScenario.known_match.falsePositiveEligible, 0);
  assert.equal(first.byScenario.no_match.falsePositiveEligible, 1);
  assert.equal(first.byScenario.known_match.avgLatencyMs, 12);
  assert.equal(first.byScenario.timeout.avgLatencyMs, 1000);
  assert.equal(jsonContainsRawImage(first), false);
  assert.doesNotMatch(JSON.stringify(first), /data:image\//);
});

test("custom fake adapter detects status mismatch and negative false positives", () => {
  const adapter = scriptedAdapter({
    "wrong-status": { status: "no_match", candidates: [], latencyMs: 1 },
    "negative-fp-matched": {
      status: "no_match",
      candidates: [fakeCandidate("Matched Status Intruder")],
      latencyMs: 2,
    },
    "negative-fp-mismatch": {
      status: "provider_failure",
      candidates: [fakeCandidate("Timeout Intruder")],
      latencyMs: 3,
    },
    "clean-negative": { status: "invalid_input", candidates: [], latencyMs: 4 },
  });
  const cases: EvaluationCase[] = [
    fixtureCase("wrong-status", "known_match", "ok"),
    fixtureCase("negative-fp-matched", "no_match", "no_match"),
    fixtureCase("negative-fp-mismatch", "timeout", "timeout"),
    fixtureCase("clean-negative", "malformed", "invalid_input"),
  ];

  const first = runEvaluationHarness(adapter, cases);
  const second = runEvaluationHarness(adapter, cases);
  assert.deepEqual(first, second);

  assert.equal(first.statusHits, 2);
  assert.equal(first.statusMismatches, 2);
  assert.equal(first.byScenario.known_match.statusMismatches, 1);
  assert.equal(first.byScenario.known_match.statusHits, 0);
  assert.equal(first.byScenario.timeout.statusMismatches, 1);
  assert.equal(first.byScenario.timeout.statusHits, 0);
  assert.equal(first.byScenario.no_match.statusHits, 1);
  assert.equal(first.byScenario.malformed.statusHits, 1);

  assert.equal(first.falsePositives, 2);
  assert.equal(first.falsePositiveEligible, 3);
  assert.equal(first.falsePositiveRate, 2 / 3);
  assert.equal(first.falsePositiveRate === first.falsePositives / first.caseCount, false);
  assert.equal(first.byScenario.no_match.falsePositives, 1);
  assert.equal(first.byScenario.timeout.falsePositives, 1);
  assert.equal(first.byScenario.malformed.falsePositives, 0);
  assert.equal(first.byScenario.known_match.falsePositives, 0);
  assert.equal(first.byScenario.known_match.falsePositiveEligible, 0);
});
