import ledgerJson from "../../docs/research/anime-discovery/source-permission-ledger.json";
import {
  ANIME_RECOGNITION_EXTERNAL_RUNTIME_ENABLED,
  ANIME_RECOGNITION_ISSUE,
  ANIME_RECOGNITION_LEDGER_CONTRACT_VERSION,
  ANIME_RECOGNITION_PINNED_BASE_SHA,
  REQUIRED_RECOGNITION_SOURCE_IDS,
  SOURCE_DECISIONS,
  SourceLedgerValidationError,
  type SourceDecision,
  type SourceLedgerEntry,
  type SourceLookup,
  type SourcePermissionLedger,
} from "./types.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isSourceDecision(value: unknown): value is SourceDecision {
  return (
    typeof value === "string" &&
    (SOURCE_DECISIONS as readonly string[]).includes(value)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SourceLedgerValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new SourceLedgerValidationError(`${label} must be an array of non-empty strings`);
  }
  return value;
}

function parseEntry(value: unknown): SourceLedgerEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SourceLedgerValidationError("source entry must be an object");
  }
  const raw = value as Record<string, unknown>;
  const id = requireNonEmptyString(raw.id, "id");
  if (!isSourceDecision(raw.decision)) {
    throw new SourceLedgerValidationError(`${id}: invalid decision`);
  }
  if (typeof raw.production_usable !== "boolean") {
    throw new SourceLedgerValidationError(`${id}: production_usable must be boolean`);
  }
  if (raw.production_usable && raw.decision !== "allowed") {
    throw new SourceLedgerValidationError(
      `${id}: production_usable can be true only when decision is allowed`
    );
  }
  if (typeof raw.reviewed_on !== "string" || !DATE_RE.test(raw.reviewed_on)) {
    throw new SourceLedgerValidationError(`${id}: reviewed_on must be YYYY-MM-DD`);
  }
  const evidenceUrls = requireStringArray(raw.evidence_urls, `${id}.evidence_urls`);
  if (evidenceUrls.length === 0) {
    throw new SourceLedgerValidationError(`${id}: evidence_urls must not be empty`);
  }

  return {
    id,
    label: requireNonEmptyString(raw.label, `${id}.label`),
    domains: requireStringArray(raw.domains, `${id}.domains`),
    role: requireNonEmptyString(raw.role, `${id}.role`),
    decision: raw.decision,
    production_usable: raw.production_usable,
    tos_url: isNullableString(raw.tos_url) ? raw.tos_url : (() => {
      throw new SourceLedgerValidationError(`${id}: tos_url must be string or null`);
    })(),
    robots_url: isNullableString(raw.robots_url) ? raw.robots_url : (() => {
      throw new SourceLedgerValidationError(`${id}: robots_url must be string or null`);
    })(),
    api_docs_url: isNullableString(raw.api_docs_url) ? raw.api_docs_url : (() => {
      throw new SourceLedgerValidationError(`${id}: api_docs_url must be string or null`);
    })(),
    privacy_url: raw.privacy_url === undefined
      ? undefined
      : isNullableString(raw.privacy_url)
        ? raw.privacy_url
        : (() => {
            throw new SourceLedgerValidationError(`${id}: privacy_url must be string or null`);
          })(),
    api_docs_source_url: raw.api_docs_source_url === undefined
      ? undefined
      : isNullableString(raw.api_docs_source_url)
        ? raw.api_docs_source_url
        : (() => {
            throw new SourceLedgerValidationError(`${id}: api_docs_source_url must be string or null`);
          })(),
    commercial_use: requireNonEmptyString(raw.commercial_use, `${id}.commercial_use`),
    storage: requireNonEmptyString(raw.storage, `${id}.storage`),
    redistribution: requireNonEmptyString(raw.redistribution, `${id}.redistribution`),
    attribution: requireNonEmptyString(raw.attribution, `${id}.attribution`),
    rate_limit: requireNonEmptyString(raw.rate_limit, `${id}.rate_limit`),
    sla: requireNonEmptyString(raw.sla, `${id}.sla`),
    contact: isNullableString(raw.contact) ? raw.contact : (() => {
      throw new SourceLedgerValidationError(`${id}: contact must be string or null`);
    })(),
    reviewed_on: raw.reviewed_on,
    evidence_urls: evidenceUrls,
    rationale_ja: requireNonEmptyString(raw.rationale_ja, `${id}.rationale_ja`),
  };
}

export function parseSourcePermissionLedger(input: unknown): SourcePermissionLedger {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new SourceLedgerValidationError("ledger must be an object");
  }
  const raw = input as Record<string, unknown>;
  if (raw.contract_version !== ANIME_RECOGNITION_LEDGER_CONTRACT_VERSION) {
    throw new SourceLedgerValidationError("contract_version mismatch");
  }
  if (raw.issue !== ANIME_RECOGNITION_ISSUE) {
    throw new SourceLedgerValidationError("issue mismatch");
  }
  if (raw.fixed_base !== ANIME_RECOGNITION_PINNED_BASE_SHA) {
    throw new SourceLedgerValidationError("fixed_base mismatch");
  }
  if (typeof raw.reviewed_on !== "string" || !DATE_RE.test(raw.reviewed_on)) {
    throw new SourceLedgerValidationError("reviewed_on must be YYYY-MM-DD");
  }
  if (raw.production_external_runtime !== "hard-off") {
    throw new SourceLedgerValidationError("production_external_runtime must be hard-off");
  }
  if (typeof raw.parent_issue !== "number") {
    throw new SourceLedgerValidationError("parent_issue must be a number");
  }
  if (typeof raw.notes_ja !== "string" || raw.notes_ja.length === 0) {
    throw new SourceLedgerValidationError("notes_ja must be a non-empty string");
  }
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    throw new SourceLedgerValidationError("sources must be a non-empty array");
  }

  const seen = new Set<string>();
  const sources = raw.sources.map((item) => {
    const entry = parseEntry(item);
    if (seen.has(entry.id)) {
      throw new SourceLedgerValidationError(`duplicate source id: ${entry.id}`);
    }
    seen.add(entry.id);
    return entry;
  });

  for (const requiredId of REQUIRED_RECOGNITION_SOURCE_IDS) {
    if (!seen.has(requiredId)) {
      throw new SourceLedgerValidationError(`missing required source: ${requiredId}`);
    }
  }

  return {
    contract_version: ANIME_RECOGNITION_LEDGER_CONTRACT_VERSION,
    issue: ANIME_RECOGNITION_ISSUE,
    parent_issue: raw.parent_issue,
    fixed_base: ANIME_RECOGNITION_PINNED_BASE_SHA,
    reviewed_on: raw.reviewed_on,
    production_external_runtime: "hard-off",
    notes_ja: raw.notes_ja,
    sources,
  };
}

const VALIDATED_LEDGER = parseSourcePermissionLedger(ledgerJson);

export function loadSourcePermissionLedger(): SourcePermissionLedger {
  return VALIDATED_LEDGER;
}

function failClosed(reason: SourceLookup["reason"]): SourceLookup {
  return { usable: false, reason, entry: null };
}

export function lookupSourcePermission(
  sourceId: string,
  ledger: unknown = VALIDATED_LEDGER
): SourceLookup {
  try {
    const validated = parseSourcePermissionLedger(ledger);
    const entry = validated.sources.find((item) => item.id === sourceId) ?? null;
    if (!entry) {
      return failClosed("absent");
    }
    if (entry.decision !== "allowed" || !entry.production_usable) {
      return {
        usable: false,
        reason: entry.decision,
        entry,
      };
    }
    void ANIME_RECOGNITION_EXTERNAL_RUNTIME_ENABLED;
    return {
      usable: false,
      reason: "external-runtime-hard-off",
      entry,
    };
  } catch {
    return failClosed("invalid-ledger");
  }
}

export function isSourceRuntimeUsable(
  sourceId: string,
  ledger: unknown = VALIDATED_LEDGER
): boolean {
  return lookupSourcePermission(sourceId, ledger).usable;
}

export function listLedgerSourceIds(
  ledger: SourcePermissionLedger = VALIDATED_LEDGER
): string[] {
  return ledger.sources.map((entry) => entry.id);
}
