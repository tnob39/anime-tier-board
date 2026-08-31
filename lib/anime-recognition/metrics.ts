import { FIXTURE_IDS, FIXTURE_TITLES, getRecognitionFixtures } from "./fixtures.ts";
import type { RecognitionAdapter } from "./fixture-adapter.ts";
import type {
  EvaluationCase,
  EvaluationScenario,
  MetricsReport,
  ScenarioMetrics,
} from "./types.ts";

const SCENARIOS: EvaluationScenario[] = [
  "known_match",
  "no_match",
  "ambiguous",
  "malformed",
  "oversized",
  "timeout",
  "provider_failure",
];

const NEGATIVE_GROUND_TRUTH_SCENARIOS: ReadonlySet<EvaluationScenario> = new Set([
  "no_match",
  "malformed",
  "oversized",
  "timeout",
  "provider_failure",
]);

function emptyScenarioMetrics(): ScenarioMetrics {
  return {
    count: 0,
    top1Hits: 0,
    top1Eligible: 0,
    top3Hits: 0,
    top3Eligible: 0,
    statusHits: 0,
    statusMismatches: 0,
    falsePositives: 0,
    falsePositiveEligible: 0,
    totalLatencyMs: 0,
    avgLatencyMs: 0,
  };
}

function isNegativeGroundTruth(scenario: EvaluationScenario): boolean {
  return NEGATIVE_GROUND_TRUTH_SCENARIOS.has(scenario);
}

export function buildDefaultEvaluationCases(): EvaluationCase[] {
  const fixtures = getRecognitionFixtures();
  return [
    {
      id: "known-match",
      scenario: "known_match",
      input: { kind: "fixture", fixtureId: FIXTURE_IDS.knownMatch },
      expectedStatus: "ok",
      expectedTop1Title: FIXTURE_TITLES.knownMatch,
      expectedTop3Titles: [
        FIXTURE_TITLES.knownMatch,
        FIXTURE_TITLES.knownMatchB,
        FIXTURE_TITLES.knownMatchC,
      ],
    },
    {
      id: "no-match",
      scenario: "no_match",
      input: { kind: "fixture", fixtureId: FIXTURE_IDS.noMatch },
      expectedStatus: "no_match",
    },
    {
      id: "ambiguous",
      scenario: "ambiguous",
      input: { kind: "fixture", fixtureId: FIXTURE_IDS.ambiguous },
      expectedStatus: "ambiguous",
      expectedTop3Titles: [FIXTURE_TITLES.ambiguousA, FIXTURE_TITLES.ambiguousB],
    },
    {
      id: "malformed",
      scenario: "malformed",
      input: { kind: "binary", bytes: fixtures[FIXTURE_IDS.malformed].bytes },
      expectedStatus: "invalid_input",
    },
    {
      id: "oversized",
      scenario: "oversized",
      input: {
        kind: "binary",
        bytes: fixtures[FIXTURE_IDS.oversized].bytes,
        declaredMime: "image/jpeg",
      },
      expectedStatus: "invalid_input",
    },
    {
      id: "timeout",
      scenario: "timeout",
      input: { kind: "fixture", fixtureId: FIXTURE_IDS.timeout },
      expectedStatus: "timeout",
    },
    {
      id: "provider-failure",
      scenario: "provider_failure",
      input: { kind: "fixture", fixtureId: FIXTURE_IDS.providerFailure },
      expectedStatus: "provider_failure",
    },
  ];
}

export function runEvaluationHarness(
  adapter: RecognitionAdapter,
  cases: EvaluationCase[] = buildDefaultEvaluationCases(),
): MetricsReport {
  const byScenario = Object.fromEntries(
    SCENARIOS.map((scenario) => [scenario, emptyScenarioMetrics()]),
  ) as Record<EvaluationScenario, ScenarioMetrics>;

  let top1Hits = 0;
  let top1Eligible = 0;
  let top3Hits = 0;
  let top3Eligible = 0;
  let statusHits = 0;
  let statusMismatches = 0;
  let falsePositives = 0;
  let falsePositiveEligible = 0;
  let totalLatencyMs = 0;

  for (const evaluationCase of cases) {
    const result = adapter.recognize(evaluationCase.input);
    const bucket = byScenario[evaluationCase.scenario];
    bucket.count += 1;
    bucket.totalLatencyMs += result.latencyMs;
    totalLatencyMs += result.latencyMs;

    if (result.status === evaluationCase.expectedStatus) {
      statusHits += 1;
      bucket.statusHits += 1;
    } else {
      statusMismatches += 1;
      bucket.statusMismatches += 1;
    }

    if (evaluationCase.expectedTop1Title) {
      top1Eligible += 1;
      bucket.top1Eligible += 1;
      if (result.candidates[0]?.title === evaluationCase.expectedTop1Title) {
        top1Hits += 1;
        bucket.top1Hits += 1;
      }
    }
    if (evaluationCase.expectedTop3Titles && evaluationCase.expectedTop3Titles.length > 0) {
      top3Eligible += 1;
      bucket.top3Eligible += 1;
      const titles = new Set(result.candidates.slice(0, 3).map((candidate) => candidate.title));
      const hit = evaluationCase.expectedTop3Titles.every((title) => titles.has(title));
      if (hit) {
        top3Hits += 1;
        bucket.top3Hits += 1;
      }
    }
    if (isNegativeGroundTruth(evaluationCase.scenario)) {
      falsePositiveEligible += 1;
      bucket.falsePositiveEligible += 1;
      if (result.candidates.length > 0) {
        falsePositives += 1;
        bucket.falsePositives += 1;
      }
    }
  }

  for (const scenario of SCENARIOS) {
    const bucket = byScenario[scenario];
    bucket.avgLatencyMs = bucket.count === 0 ? 0 : bucket.totalLatencyMs / bucket.count;
  }

  return {
    contractVersion: "1.0",
    adapter: "fixture",
    externalRuntimeEnabled: false,
    caseCount: cases.length,
    top1Hits,
    top1Eligible,
    top1Precision: top1Eligible === 0 ? 0 : top1Hits / top1Eligible,
    top3Hits,
    top3Eligible,
    top3Precision: top3Eligible === 0 ? 0 : top3Hits / top3Eligible,
    statusHits,
    statusMismatches,
    falsePositives,
    falsePositiveEligible,
    falsePositiveRate:
      falsePositiveEligible === 0 ? 0 : falsePositives / falsePositiveEligible,
    avgLatencyMs: cases.length === 0 ? 0 : totalLatencyMs / cases.length,
    byScenario,
  };
}
