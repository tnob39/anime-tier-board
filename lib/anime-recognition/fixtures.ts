import { ANIME_RECOGNITION_MAX_BYTES } from "./types.ts";
import { buildJpegFixture, buildPngFixture, buildWebpFixture } from "./validation.ts";

export const FIXTURE_IDS = {
  knownMatch: "known-match",
  noMatch: "no-match",
  ambiguous: "ambiguous",
  malformed: "malformed",
  oversized: "oversized",
  timeout: "timeout",
  providerFailure: "provider-failure",
} as const;

export type FixtureId = (typeof FIXTURE_IDS)[keyof typeof FIXTURE_IDS];

export type FixtureOutcome =
  | "ok"
  | "no_match"
  | "ambiguous"
  | "invalid_input"
  | "timeout"
  | "provider_failure";

export type FixtureCandidateSpec = {
  title: string;
  episode: string | null;
  from: number | null;
  to: number | null;
  confidence: number;
  source: string;
};

export type RecognitionFixture = {
  id: FixtureId;
  outcome: FixtureOutcome;
  latencyMs: number;
  validationCode?: string;
  errorCode?: string;
  bytes: Uint8Array;
  declaredMime?: string;
  candidates: FixtureCandidateSpec[];
};

const KNOWN_TITLE = "Fixture Known Match";
const KNOWN_TITLE_B = "Fixture Known Match Runner-up";
const KNOWN_TITLE_C = "Fixture Known Match Third";
const AMBIGUOUS_A = "Fixture Ambiguous Alpha";
const AMBIGUOUS_B = "Fixture Ambiguous Beta";

let cachedFixtures: Record<FixtureId, RecognitionFixture> | null = null;

export function getRecognitionFixtures(): Record<FixtureId, RecognitionFixture> {
  if (cachedFixtures) {
    return cachedFixtures;
  }
  const knownBytes = buildJpegFixture({ width: 64, height: 36, withExif: true });
  const noMatchBytes = buildPngFixture({ width: 32, height: 32 });
  const ambiguousBytes = buildWebpFixture({ width: 48, height: 27 });
  const timeoutBytes = buildJpegFixture({ width: 16, height: 16 });
  const failureBytes = buildJpegFixture({ width: 20, height: 20 });
  const oversized = new Uint8Array(ANIME_RECOGNITION_MAX_BYTES + 1);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  oversized.set(buildJpegFixture({ width: 8, height: 8 }).subarray(3), 3);

  const built: Record<FixtureId, RecognitionFixture> = {
    [FIXTURE_IDS.knownMatch]: {
      id: FIXTURE_IDS.knownMatch,
      outcome: "ok",
      latencyMs: 12,
      bytes: knownBytes,
      declaredMime: "image/jpeg",
      candidates: [
        {
          title: KNOWN_TITLE,
          episode: "3",
          from: 12.5,
          to: 14.0,
          confidence: 0.97,
          source: "fixture-local",
        },
        {
          title: KNOWN_TITLE_B,
          episode: "3",
          from: 10.0,
          to: 11.0,
          confidence: 0.91,
          source: "fixture-local",
        },
        {
          title: KNOWN_TITLE_C,
          episode: "12",
          from: 40.0,
          to: 41.0,
          confidence: 0.88,
          source: "fixture-local",
        },
      ],
    },
    [FIXTURE_IDS.noMatch]: {
      id: FIXTURE_IDS.noMatch,
      outcome: "no_match",
      latencyMs: 9,
      bytes: noMatchBytes,
      declaredMime: "image/png",
      candidates: [],
    },
    [FIXTURE_IDS.ambiguous]: {
      id: FIXTURE_IDS.ambiguous,
      outcome: "ambiguous",
      latencyMs: 15,
      bytes: ambiguousBytes,
      declaredMime: "image/webp",
      candidates: [
        {
          title: AMBIGUOUS_A,
          episode: "1",
          from: 1.0,
          to: 2.0,
          confidence: 0.81,
          source: "fixture-local",
        },
        {
          title: AMBIGUOUS_B,
          episode: "2",
          from: 8.0,
          to: 9.5,
          confidence: 0.8,
          source: "fixture-local",
        },
      ],
    },
    [FIXTURE_IDS.malformed]: {
      id: FIXTURE_IDS.malformed,
      outcome: "invalid_input",
      latencyMs: 2,
      validationCode: "unsupported_type",
      bytes: Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]),
      candidates: [],
    },
    [FIXTURE_IDS.oversized]: {
      id: FIXTURE_IDS.oversized,
      outcome: "invalid_input",
      latencyMs: 2,
      validationCode: "oversized",
      bytes: oversized,
      declaredMime: "image/jpeg",
      candidates: [],
    },
    [FIXTURE_IDS.timeout]: {
      id: FIXTURE_IDS.timeout,
      outcome: "timeout",
      latencyMs: 1000,
      errorCode: "fixture-timeout",
      bytes: timeoutBytes,
      declaredMime: "image/jpeg",
      candidates: [],
    },
    [FIXTURE_IDS.providerFailure]: {
      id: FIXTURE_IDS.providerFailure,
      outcome: "provider_failure",
      latencyMs: 40,
      errorCode: "fixture-provider-503",
      bytes: failureBytes,
      declaredMime: "image/jpeg",
      candidates: [],
    },
  };
  cachedFixtures = built;
  return built;
}

export function getFixtureById(fixtureId: string): RecognitionFixture | null {
  const fixtures = getRecognitionFixtures();
  if (fixtureId in fixtures) {
    return fixtures[fixtureId as FixtureId];
  }
  return null;
}

export const FIXTURE_TITLES = {
  knownMatch: KNOWN_TITLE,
  knownMatchB: KNOWN_TITLE_B,
  knownMatchC: KNOWN_TITLE_C,
  ambiguousA: AMBIGUOUS_A,
  ambiguousB: AMBIGUOUS_B,
} as const;
