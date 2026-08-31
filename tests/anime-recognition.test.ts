/**
 * Issue #760 Stage A — source ledger, fixture adapter, validation, metrics.
 * Run: npx --yes tsx --test tests/anime-recognition.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createExternalRecognitionAdapter,
  createFixtureRecognitionAdapter,
  type RecognitionAdapter,
} from "../lib/anime-recognition/fixture-adapter.ts";
import { FIXTURE_IDS, FIXTURE_TITLES, getRecognitionFixtures } from "../lib/anime-recognition/fixtures.ts";
import { buildDefaultEvaluationCases, runEvaluationHarness } from "../lib/anime-recognition/metrics.ts";
import {
  describeInputSafely,
  jsonContainsRawImage,
  recognitionResultForLog,
  sanitizeRecognitionLog,
} from "../lib/anime-recognition/privacy.ts";
import {
  isSourceRuntimeUsable,
  listLedgerSourceIds,
  loadSourcePermissionLedger,
  lookupSourcePermission,
  parseSourcePermissionLedger,
} from "../lib/anime-recognition/source-ledger.ts";
import {
  ANIME_RECOGNITION_EXTERNAL_RUNTIME_ENABLED,
  ANIME_RECOGNITION_MAX_BYTES,
  ANIME_RECOGNITION_PINNED_BASE_SHA,
  ExternalRuntimeForbiddenError,
  REQUIRED_RECOGNITION_SOURCE_IDS,
  type EvaluationCase,
  type RecognitionCandidate,
  type RecognitionInput,
  type RecognitionResult,
  type SourceLedgerEntry,
  type SourcePermissionLedger,
} from "../lib/anime-recognition/types.ts";
import {
  buildJpegFixture,
  buildPngFixture,
  buildWebpFixture,
  detectImageMimeFromMagic,
  validateRecognitionImage,
} from "../lib/anime-recognition/validation.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const LEDGER_JSON = path.join(
  projectRoot,
  "docs/research/anime-discovery/source-permission-ledger.json"
);

function readUtf8(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function walkFiles(root: string, acc: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    const full = path.join(root, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

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

function allowedEntry(id: string): SourceLedgerEntry {
  return {
    id,
    label: "Hypothetical licensed source",
    domains: ["example.test"],
    role: "test-only-injected-allowed",
    decision: "allowed",
    production_usable: true,
    tos_url: "https://example.test/terms",
    robots_url: "https://example.test/robots.txt",
    api_docs_url: "https://example.test/docs",
    commercial_use: "explicit written license for tests only",
    storage: "not granted in production ledger",
    redistribution: "not granted in production ledger",
    attribution: "test",
    rate_limit: "n/a",
    sla: "n/a",
    contact: "test@example.test",
    reviewed_on: "2026-08-31",
    evidence_urls: ["https://example.test/terms"],
    rationale_ja: "テスト用の注入エントリ。本番ledgerには存在しない。",
  };
}

test("JSON ledger matches runtime ledger and required sources", () => {
  const fromFile = JSON.parse(readFileSync(LEDGER_JSON, "utf8"));
  const parsed = parseSourcePermissionLedger(fromFile);
  const loaded = loadSourcePermissionLedger();
  assert.deepEqual(loaded, parsed);
  assert.equal(loaded.fixed_base, ANIME_RECOGNITION_PINNED_BASE_SHA);
  assert.equal(loaded.production_external_runtime, "hard-off");
  assert.equal(ANIME_RECOGNITION_EXTERNAL_RUNTIME_ENABLED, false);
  for (const id of REQUIRED_RECOGNITION_SOURCE_IDS) {
    assert.ok(listLedgerSourceIds().includes(id), `missing ${id}`);
  }
  assert.equal(loaded.sources.every((entry) => entry.decision !== "allowed"), true);
  assert.equal(loaded.sources.every((entry) => entry.production_usable === false), true);
  for (const entry of loaded.sources) {
    assert.match(entry.reviewed_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.evidence_urls.length > 0, `${entry.id} missing evidence`);
    assert.ok(entry.commercial_use.length > 0);
    assert.ok(entry.storage.length > 0);
    assert.ok(entry.redistribution.length > 0);
    assert.ok(entry.attribution.length > 0);
    assert.ok(entry.rate_limit.length > 0);
    assert.ok(entry.sla.length > 0);
  }
});

test("unknown, permission-required, prohibited, and absent sources are unusable", () => {
  const jikan = lookupSourcePermission("jikan");
  assert.equal(jikan.usable, false);
  assert.equal(jikan.reason, "unknown");
  assert.equal(isSourceRuntimeUsable("jikan"), false);

  const traceMoe = lookupSourcePermission("trace-moe");
  assert.equal(traceMoe.usable, false);
  assert.equal(traceMoe.reason, "permission-required");

  const anilist = lookupSourcePermission("anilist");
  assert.equal(anilist.usable, false);
  assert.equal(anilist.reason, "permission-required");

  const officialPv = lookupSourcePermission("official-pv");
  assert.equal(officialPv.usable, false);
  assert.equal(officialPv.reason, "permission-required");

  const prohibited = lookupSourcePermission("unauthorized-full-episode-index");
  assert.equal(prohibited.usable, false);
  assert.equal(prohibited.reason, "prohibited");

  const absent = lookupSourcePermission("not-in-ledger");
  assert.equal(absent.usable, false);
  assert.equal(absent.reason, "absent");
  assert.equal(isSourceRuntimeUsable("not-in-ledger"), false);
});

test("invalid ledger and injected allowed source stay fail-closed", () => {
  const invalid = lookupSourcePermission("jikan", { broken: true } as unknown as SourcePermissionLedger);
  assert.equal(invalid.usable, false);
  assert.equal(invalid.reason, "invalid-ledger");

  const mutated = structuredClone(loadSourcePermissionLedger());
  mutated.sources.push(allowedEntry("hypothetical-licensed"));
  const allowedLookup = lookupSourcePermission("hypothetical-licensed", mutated);
  assert.equal(allowedLookup.usable, false);
  assert.equal(allowedLookup.reason, "external-runtime-hard-off");
  assert.equal(isSourceRuntimeUsable("hypothetical-licensed", mutated), false);
});

test("validation handles size, type, magic bytes, EXIF, and image bombs", () => {
  const jpeg = buildJpegFixture({ width: 64, height: 36, withExif: true });
  const png = buildPngFixture({ width: 32, height: 32 });
  const webp = buildWebpFixture({ width: 48, height: 27 });
  assert.equal(detectImageMimeFromMagic(jpeg), "image/jpeg");
  assert.equal(detectImageMimeFromMagic(png), "image/png");
  assert.equal(detectImageMimeFromMagic(webp), "image/webp");

  const jpegOk = validateRecognitionImage(jpeg, "image/jpeg");
  assert.equal(jpegOk.ok, true);
  if (jpegOk.ok) {
    assert.equal(jpegOk.hasExif, true);
    assert.equal(jpegOk.width, 64);
    assert.equal(jpegOk.height, 36);
    assert.equal(new TextDecoder("latin1").decode(jpegOk.sanitizedBytes).includes("Exif"), false);
  }

  assert.equal(validateRecognitionImage(png).ok, true);
  assert.equal(validateRecognitionImage(webp).ok, true);

  const empty = validateRecognitionImage(new Uint8Array());
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.code, "empty");
  }

  const oversized = validateRecognitionImage(new Uint8Array(ANIME_RECOGNITION_MAX_BYTES + 1));
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.code, "oversized");
  }

  const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 1, 0, 1, 0, 0]);
  const gifResult = validateRecognitionImage(gif);
  assert.equal(gifResult.ok, false);
  if (!gifResult.ok) {
    assert.equal(gifResult.code, "unsupported_type");
  }

  const mismatch = validateRecognitionImage(jpeg, "image/png");
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.equal(mismatch.code, "magic_mismatch");
  }

  const noSof = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const unknownDim = validateRecognitionImage(noSof);
  assert.equal(unknownDim.ok, false);
  if (!unknownDim.ok) {
    assert.equal(unknownDim.code, "dimensions_unknown");
  }

  const bomb = validateRecognitionImage(buildJpegFixture({ width: 4000, height: 4000 }));
  assert.equal(bomb.ok, false);
  if (!bomb.ok) {
    assert.equal(bomb.code, "image_bomb");
  }
});

test("fixture adapter reproduces known/no-match/ambiguous/failure without external calls", () => {
  const adapter = createFixtureRecognitionAdapter();
  const fixtures = getRecognitionFixtures();

  const known = adapter.recognize({ kind: "fixture", fixtureId: FIXTURE_IDS.knownMatch });
  assert.equal(known.status, "ok");
  assert.equal(known.candidates[0]?.title, FIXTURE_TITLES.knownMatch);
  assert.equal(known.candidates[0]?.episode, "3");
  assert.equal(known.candidates[0]?.provenance.adapter, "fixture");

  const binaryKnown = adapter.recognize({
    kind: "binary",
    bytes: fixtures[FIXTURE_IDS.knownMatch].bytes,
    declaredMime: "image/jpeg",
  });
  assert.equal(binaryKnown.status, "ok");
  assert.equal(binaryKnown.candidates[0]?.title, FIXTURE_TITLES.knownMatch);

  assert.equal(adapter.recognize({ kind: "fixture", fixtureId: FIXTURE_IDS.noMatch }).status, "no_match");
  const ambiguous = adapter.recognize({ kind: "fixture", fixtureId: FIXTURE_IDS.ambiguous });
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.candidates.length, 2);

  assert.equal(adapter.recognize({ kind: "fixture", fixtureId: FIXTURE_IDS.timeout }).status, "timeout");
  assert.equal(
    adapter.recognize({ kind: "fixture", fixtureId: FIXTURE_IDS.providerFailure }).status,
    "provider_failure"
  );

  const malformed = adapter.recognize({
    kind: "binary",
    bytes: fixtures[FIXTURE_IDS.malformed].bytes,
  });
  assert.equal(malformed.status, "invalid_input");
  assert.equal(malformed.validationCode, "unsupported_type");

  const oversized = adapter.recognize({
    kind: "binary",
    bytes: fixtures[FIXTURE_IDS.oversized].bytes,
    declaredMime: "image/jpeg",
  });
  assert.equal(oversized.status, "invalid_input");
  assert.equal(oversized.validationCode, "oversized");

  const unknownSource = adapter.recognize(
    { kind: "fixture", fixtureId: FIXTURE_IDS.knownMatch },
    { requestedSourceId: "jikan" }
  );
  assert.equal(unknownSource.status, "source_not_usable");
  assert.equal(unknownSource.sourceDecision, "unknown");
  assert.equal(unknownSource.candidates.length, 0);

  const urlFixture = adapter.recognize({
    kind: "fixture",
    fixtureId: "https://example.test/search",
  });
  assert.equal(urlFixture.status, "invalid_input");
  assert.equal(urlFixture.validationCode, "url_forbidden");
  assert.equal(urlFixture.candidates.length, 0);

  assert.throws(() => createExternalRecognitionAdapter(), (error: unknown) => {
    assert.ok(error instanceof ExternalRuntimeForbiddenError);
    return true;
  });
});

test("raw image bytes are not written into logs or metrics reports", () => {
  const adapter = createFixtureRecognitionAdapter();
  const fixtures = getRecognitionFixtures();
  const input = {
    kind: "binary" as const,
    bytes: fixtures[FIXTURE_IDS.knownMatch].bytes,
    declaredMime: "image/jpeg",
  };
  const result = adapter.recognize(input);
  const safe = describeInputSafely(input);
  assert.equal("bytes" in safe, false);
  assert.equal(typeof safe.byteLength, "number");
  assert.equal(typeof safe.sha256Hex, "string");

  const log = recognitionResultForLog(result);
  assert.equal(jsonContainsRawImage(log), false);

  const dirty = {
    bytes: input.bytes,
    imageBytes: input.bytes,
    dataUrl: "data:image/jpeg;base64,AAAA",
    note: "data:image/jpeg;base64,AAAA",
    nested: { buffer: input.bytes, ok: true },
  };
  const cleaned = sanitizeRecognitionLog(dirty) as Record<string, unknown>;
  assert.equal("bytes" in cleaned, false);
  assert.equal("imageBytes" in cleaned, false);
  assert.equal("dataUrl" in cleaned, false);
  assert.equal(cleaned.note, "[redacted-data-url]");
  assert.deepEqual(cleaned.nested, { ok: true });

  const report = runEvaluationHarness(adapter);
  const serialized = JSON.stringify(report);
  assert.equal(jsonContainsRawImage(report), false);
  assert.equal(serialized.includes("data:image/"), false);
  assert.equal(serialized.includes("FFD8"), false);
});

test("metrics harness is deterministic from fixtures", () => {
  const adapter = createFixtureRecognitionAdapter();
  const cases = buildDefaultEvaluationCases();
  assert.deepEqual(
    cases.map((item) => item.scenario).sort(),
    ["ambiguous", "known_match", "malformed", "no_match", "oversized", "provider_failure", "timeout"]
  );
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
  assert.equal(first.byScenario.known_match.count, 1);
  assert.equal(first.byScenario.known_match.statusHits, 1);
  assert.equal(first.byScenario.known_match.falsePositiveEligible, 0);
  assert.equal(first.byScenario.no_match.falsePositiveEligible, 1);
  assert.equal(first.byScenario.timeout.count, 1);
  assert.equal(first.byScenario.provider_failure.count, 1);
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
  assert.equal(first.byScenario.timeout.statusMismatches, 1);
  assert.equal(first.byScenario.no_match.statusHits, 1);

  assert.equal(first.falsePositives, 2);
  assert.equal(first.falsePositiveEligible, 3);
  assert.equal(first.falsePositiveRate, 2 / 3);
  assert.equal(first.falsePositiveRate === first.falsePositives / first.caseCount, false);
  assert.equal(first.byScenario.no_match.falsePositives, 1);
  assert.equal(first.byScenario.timeout.falsePositives, 1);
  assert.equal(first.byScenario.malformed.falsePositives, 0);
  assert.equal(first.byScenario.known_match.falsePositives, 0);
});

test("adapter and runtime modules do not call real domains", () => {
  const runtimeFiles = [
    "lib/anime-recognition/fixture-adapter.ts",
    "lib/anime-recognition/metrics.ts",
    "lib/anime-recognition/validation.ts",
    "lib/anime-recognition/fixtures.ts",
    "lib/anime-recognition/privacy.ts",
  ];
  for (const relative of runtimeFiles) {
    const source = readUtf8(relative);
    assert.equal(/\bfetch\s*\(/.test(source), false, relative);
    assert.equal(/\bhttps?:\/\//.test(source), false, relative);
    assert.equal(source.includes("trace.moe"), false, relative);
    assert.equal(source.includes("api.jikan.moe"), false, relative);
  }
});

test("production routes and pages do not import the recognition module", () => {
  const roots = [path.join(projectRoot, "app"), path.join(projectRoot, "components")];
  for (const root of roots) {
    for (const file of walkFiles(root)) {
      if (!/\.(ts|tsx|js|jsx)$/.test(file)) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      assert.equal(
        source.includes("anime-recognition"),
        false,
        path.relative(projectRoot, file)
      );
    }
  }
});
