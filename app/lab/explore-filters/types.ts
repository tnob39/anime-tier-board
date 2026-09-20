export const SOURCE_DECISIONS = [
  "allowed",
  "permission-required",
  "unknown"
] as const;

export type SourceDecision = (typeof SOURCE_DECISIONS)[number];

export const AVAILABILITY_KINDS = [
  "flatrate",
  "rent",
  "buy",
  "unavailable"
] as const;

export type AvailabilityKind = (typeof AVAILABILITY_KINDS)[number];

export const AVAILABILITY_FILTERS = [
  "all",
  "legal",
  "flatrate",
  "rent",
  "buy",
  "unavailable"
] as const;

export type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number];

export type ExploreStaffCredit = {
  nameJa: string;
  nameRomaji: string;
  roleJa: string;
  roleRomaji: string;
};

export type ExploreStudio = {
  nameJa: string;
  nameRomaji: string;
};

export type ExploreSourceProvenance = {
  id: string;
  labelJa: string;
  domain: string;
  decision: SourceDecision;
  reviewedOn: string;
  confirmedAt: string;
  evidence: string;
  watchUrl: string | null;
};

export type ExploreFixtureItem = {
  id: string;
  titleJa: string;
  titleRomaji: string;
  year: number;
  region: "JP" | "US";
  availability: AvailabilityKind;
  studio: ExploreStudio;
  staff: ExploreStaffCredit[];
  source: ExploreSourceProvenance;
};

export type ExploreFilters = {
  availability: AvailabilityFilter;
  decade: string;
  studio: string;
  staff: string;
};
