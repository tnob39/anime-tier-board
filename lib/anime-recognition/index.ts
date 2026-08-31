export {
  ANIME_RECOGNITION_ALLOWED_MIME,
  ANIME_RECOGNITION_EXTERNAL_RUNTIME_ENABLED,
  ANIME_RECOGNITION_LEDGER_CONTRACT_VERSION,
  ANIME_RECOGNITION_MAX_BYTES,
  ANIME_RECOGNITION_MAX_HEIGHT,
  ANIME_RECOGNITION_MAX_PIXELS,
  ANIME_RECOGNITION_MAX_WIDTH,
  ANIME_RECOGNITION_PINNED_BASE_SHA,
  ExternalRuntimeForbiddenError,
  SOURCE_DECISIONS,
  SourceLedgerValidationError,
} from "./types.ts";
export type {
  AnimeRecognitionImageMime,
  Clock,
  EvaluationCase,
  EvaluationScenario,
  MetricsReport,
  RecognitionCandidate,
  RecognitionInput,
  RecognitionResult,
  SourceDecision,
  SourceLedgerEntry,
  SourceLookup,
  SourcePermissionLedger,
} from "./types.ts";
export {
  isSourceRuntimeUsable,
  listLedgerSourceIds,
  loadSourcePermissionLedger,
  lookupSourcePermission,
  parseSourcePermissionLedger,
} from "./source-ledger.ts";
export {
  buildJpegFixture,
  buildPngFixture,
  buildWebpFixture,
  detectImageMimeFromMagic,
  validateRecognitionImage,
} from "./validation.ts";
export {
  describeInputSafely,
  jsonContainsRawImage,
  recognitionResultForLog,
  sanitizeRecognitionLog,
  sha256Hex,
} from "./privacy.ts";
export { FIXTURE_IDS, FIXTURE_TITLES, getFixtureById, getRecognitionFixtures } from "./fixtures.ts";
export {
  createExternalRecognitionAdapter,
  createFixtureRecognitionAdapter,
} from "./fixture-adapter.ts";
export type { RecognitionAdapter, RecognizeOptions } from "./fixture-adapter.ts";
export { buildDefaultEvaluationCases, runEvaluationHarness } from "./metrics.ts";
