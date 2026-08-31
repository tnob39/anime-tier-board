import { lookupSourcePermission } from "./source-ledger.ts";
import {
  FIXTURE_IDS,
  getFixtureById,
  getRecognitionFixtures,
  type FixtureId,
  type RecognitionFixture,
} from "./fixtures.ts";
import {
  ExternalRuntimeForbiddenError,
  type Clock,
  type RecognitionCandidate,
  type RecognitionInput,
  type RecognitionResult,
} from "./types.ts";
import { validateRecognitionImage } from "./validation.ts";

export type RecognizeOptions = {
  requestedSourceId?: string;
  clock?: Clock;
};

export type RecognitionAdapter = {
  readonly name: "fixture" | "external";
  recognize(input: RecognitionInput, options?: RecognizeOptions): RecognitionResult;
};

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function candidatesFromFixture(
  fixture: RecognitionFixture,
  retrievedAtMs: number
): RecognitionCandidate[] {
  return fixture.candidates.map((candidate) => ({
    title: candidate.title,
    episode: candidate.episode,
    from: candidate.from,
    to: candidate.to,
    confidence: candidate.confidence,
    source: candidate.source,
    provenance: {
      adapter: "fixture",
      fixtureId: fixture.id,
      sourceId: candidate.source,
      retrievedAtMs,
    },
  }));
}

function resultFromFixture(
  fixture: RecognitionFixture,
  retrievedAtMs: number
): RecognitionResult {
  return {
    status: fixture.outcome,
    candidates: candidatesFromFixture(fixture, retrievedAtMs),
    latencyMs: fixture.latencyMs,
    validationCode: fixture.validationCode,
    errorCode: fixture.errorCode,
  };
}

function findFixtureByBytes(bytes: Uint8Array): RecognitionFixture | null {
  for (const fixture of Object.values(getRecognitionFixtures())) {
    if (fixture.id === FIXTURE_IDS.oversized) {
      continue;
    }
    if (sameBytes(fixture.bytes, bytes)) {
      return fixture;
    }
  }
  return null;
}

function isFixtureId(value: string): value is FixtureId {
  return (Object.values(FIXTURE_IDS) as string[]).includes(value);
}

function sourceGate(requestedSourceId: string | undefined): RecognitionResult | null {
  if (!requestedSourceId) {
    return null;
  }
  const lookup = lookupSourcePermission(requestedSourceId);
  if (!lookup.usable) {
    return {
      status: "source_not_usable",
      candidates: [],
      latencyMs: 0,
      requestedSourceId,
      sourceDecision: lookup.reason,
    };
  }
  return {
    status: "source_not_usable",
    candidates: [],
    latencyMs: 0,
    requestedSourceId,
    sourceDecision: "external-runtime-hard-off",
  };
}

export function createFixtureRecognitionAdapter(): RecognitionAdapter {
  return {
    name: "fixture",
    recognize(input: RecognitionInput, options: RecognizeOptions = {}): RecognitionResult {
      const blocked = sourceGate(options.requestedSourceId);
      if (blocked) {
        return blocked;
      }
      const retrievedAtMs = options.clock?.now() ?? 0;

      if (input.kind === "fixture") {
        if (/:\/\//.test(input.fixtureId) || input.fixtureId.includes("\\")) {
          return {
            status: "invalid_input",
            candidates: [],
            latencyMs: 0,
            validationCode: "url_forbidden",
          };
        }
        if (!isFixtureId(input.fixtureId)) {
          return {
            status: "invalid_input",
            candidates: [],
            latencyMs: 0,
            validationCode: "unknown_fixture",
          };
        }
        const fixture = getFixtureById(input.fixtureId);
        if (!fixture) {
          return {
            status: "invalid_input",
            candidates: [],
            latencyMs: 0,
            validationCode: "unknown_fixture",
          };
        }
        if (fixture.outcome === "invalid_input") {
          return resultFromFixture(fixture, retrievedAtMs);
        }
        return resultFromFixture(fixture, retrievedAtMs);
      }

      const validated = validateRecognitionImage(input.bytes, input.declaredMime);
      if (!validated.ok) {
        return {
          status: "invalid_input",
          candidates: [],
          latencyMs: 1,
          validationCode: validated.code,
        };
      }
      const matched = findFixtureByBytes(input.bytes);
      if (!matched) {
        return {
          status: "no_match",
          candidates: [],
          latencyMs: 5,
        };
      }
      return resultFromFixture(matched, retrievedAtMs);
    },
  };
}

export function createExternalRecognitionAdapter(): RecognitionAdapter {
  throw new ExternalRuntimeForbiddenError(
    "production external recognition adapter is hard-off; fixture adapter only"
  );
}
