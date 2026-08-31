export const SOURCE_DECISIONS = [
  "allowed",
  "permission-required",
  "unknown",
  "prohibited",
] as const;
export type SourceDecision = (typeof SOURCE_DECISIONS)[number];

export const ANIME_RECOGNITION_EXTERNAL_RUNTIME_ENABLED = false as const;
export const ANIME_RECOGNITION_PINNED_BASE_SHA =
  "7b3de096d33ee8e7c025ff73072d1191cfc0f308" as const;
export const ANIME_RECOGNITION_ISSUE = 760 as const;
export const ANIME_RECOGNITION_REVIEWED_ON = "2026-08-31" as const;
export const ANIME_RECOGNITION_LEDGER_CONTRACT_VERSION = "1.0" as const;

export const ANIME_RECOGNITION_MAX_BYTES = 2 * 1024 * 1024;
export const ANIME_RECOGNITION_MAX_WIDTH = 4096;
export const ANIME_RECOGNITION_MAX_HEIGHT = 4096;
export const ANIME_RECOGNITION_MAX_PIXELS = 8_000_000;
export const ANIME_RECOGNITION_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AnimeRecognitionImageMime =
  (typeof ANIME_RECOGNITION_ALLOWED_MIME)[number];

export const REQUIRED_RECOGNITION_SOURCE_IDS = [
  "trace-moe",
  "anilist",
  "jikan",
  "official-pv",
  "unauthorized-full-episode-index",
] as const;
export type RequiredRecognitionSourceId =
  (typeof REQUIRED_RECOGNITION_SOURCE_IDS)[number];

export type RecognitionInput =
  | { kind: "binary"; bytes: Uint8Array; declaredMime?: string }
  | { kind: "fixture"; fixtureId: string };

export type RecognitionProvenance = {
  adapter: "fixture";
  fixtureId: string;
  sourceId: string;
  retrievedAtMs: number;
};

export type RecognitionCandidate = {
  title: string;
  episode: string | null;
  from: number | null;
  to: number | null;
  confidence: number;
  source: string;
  provenance: RecognitionProvenance;
};

export const RECOGNITION_STATUSES = [
  "ok",
  "no_match",
  "ambiguous",
  "invalid_input",
  "timeout",
  "provider_failure",
  "source_not_usable",
] as const;
export type RecognitionStatus = (typeof RECOGNITION_STATUSES)[number];

export type SourceLookupReason =
  | SourceDecision
  | "absent"
  | "invalid-ledger"
  | "external-runtime-hard-off";

export type RecognitionResult = {
  status: RecognitionStatus;
  candidates: RecognitionCandidate[];
  latencyMs: number;
  requestedSourceId?: string;
  sourceDecision?: SourceLookupReason;
  validationCode?: string;
  errorCode?: string;
};

export type SourceLedgerEntry = {
  id: string;
  label: string;
  domains: string[];
  role: string;
  decision: SourceDecision;
  production_usable: boolean;
  tos_url: string | null;
  robots_url: string | null;
  api_docs_url: string | null;
  privacy_url?: string | null;
  api_docs_source_url?: string | null;
  commercial_use: string;
  storage: string;
  redistribution: string;
  attribution: string;
  rate_limit: string;
  sla: string;
  contact: string | null;
  reviewed_on: string;
  evidence_urls: string[];
  rationale_ja: string;
};

export type SourcePermissionLedger = {
  contract_version: string;
  issue: number;
  parent_issue: number;
  fixed_base: string;
  reviewed_on: string;
  production_external_runtime: "hard-off";
  notes_ja: string;
  sources: SourceLedgerEntry[];
};

export type SourceLookup =
  | {
      usable: false;
      reason: SourceLookupReason;
      entry: SourceLedgerEntry | null;
    }
  | {
      usable: true;
      reason: "allowed";
      entry: SourceLedgerEntry;
    };

export type Clock = {
  now(): number;
};

export type EvaluationScenario =
  | "known_match"
  | "no_match"
  | "ambiguous"
  | "malformed"
  | "oversized"
  | "timeout"
  | "provider_failure";

export type EvaluationCase = {
  id: string;
  scenario: EvaluationScenario;
  input: RecognitionInput;
  expectedStatus: RecognitionStatus;
  expectedTop1Title?: string;
  expectedTop3Titles?: string[];
};

export type ScenarioMetrics = {
  count: number;
  top1Hits: number;
  top1Eligible: number;
  top3Hits: number;
  top3Eligible: number;
  statusHits: number;
  statusMismatches: number;
  falsePositives: number;
  falsePositiveEligible: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
};

export type MetricsReport = {
  contractVersion: "1.0";
  adapter: "fixture";
  externalRuntimeEnabled: false;
  caseCount: number;
  top1Hits: number;
  top1Eligible: number;
  top1Precision: number;
  top3Hits: number;
  top3Eligible: number;
  top3Precision: number;
  statusHits: number;
  statusMismatches: number;
  falsePositives: number;
  falsePositiveEligible: number;
  falsePositiveRate: number;
  avgLatencyMs: number;
  byScenario: Record<EvaluationScenario, ScenarioMetrics>;
};

export class ExternalRuntimeForbiddenError extends Error {
  constructor(message = "anime recognition external runtime is hard-off") {
    super(message);
    this.name = "ExternalRuntimeForbiddenError";
  }
}

export class SourceLedgerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceLedgerValidationError";
  }
}
