import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnimeStatusRecord, ViewingStatus } from "../lib/statuses.ts";
import type { AnimeItem, StreamingProvider } from "../lib/types.ts";
import {
  rankNextActions,
  type HomeNextAction,
  type NextActionCandidate
} from "../lib/home-next-actions.ts";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function makeAnime(id: string, title = `Anime ${id}`): AnimeItem {
  return {
    id,
    source: "anilist",
    title,
    titles: { userPreferred: title },
    imageUrl: `https://example.com/${id}.jpg`,
    proxiedImageUrl: `/api/image-proxy?url=${id}`,
    siteUrl: `https://anilist.co/anime/${id}`
  };
}

function makeRecord(input: {
  animeId: string;
  status: ViewingStatus;
  updatedAt: string;
  watchedEpisodes?: number | null;
  anime?: AnimeItem | null;
}): AnimeStatusRecord {
  return {
    animeId: input.animeId,
    status: input.status,
    anime: input.anime === undefined ? makeAnime(input.animeId) : input.anime,
    favoriteLevel: null,
    watchSlot: null,
    notes: null,
    watchRhythm: null,
    watchedEpisodes: input.watchedEpisodes === undefined ? null : input.watchedEpisodes,
    updatedAt: input.updatedAt
  };
}

function makeCandidate(
  record: AnimeStatusRecord,
  overrides: Partial<
    Omit<NextActionCandidate, "record">
  > = {}
): NextActionCandidate {
  return {
    record,
    latestAvailableEpisode: null,
    availabilityConfidence: "unknown",
    provider: null,
    likelyNewEpisodeThisWeek: false,
    ...overrides
  };
}

function ids(actions: HomeNextAction[]): string[] {
  return actions.map((action) => action.anime.id);
}

test("ranks all five buckets deterministically with tie-breakers", () => {
  const provider: StreamingProvider = {
    id: 8,
    name: "Netflix",
    logoUrl: null
  };

  const bucket1 = makeCandidate(
    makeRecord({
      animeId: "b1",
      status: "watching",
      watchedEpisodes: 3,
      updatedAt: "2026-07-01T00:00:00.000Z"
    }),
    {
      latestAvailableEpisode: 5,
      availabilityConfidence: "confirmed",
      provider,
      likelyNewEpisodeThisWeek: true
    }
  );

  const bucket2 = makeCandidate(
    makeRecord({
      animeId: "b2",
      status: "planned",
      updatedAt: "2026-07-10T00:00:00.000Z"
    }),
    {
      latestAvailableEpisode: 2,
      availabilityConfidence: "estimated",
      likelyNewEpisodeThisWeek: true
    }
  );

  const bucket3 = makeCandidate(
    makeRecord({
      animeId: "b3",
      status: "watching",
      watchedEpisodes: 4,
      updatedAt: "2026-07-05T12:00:00.000Z"
    }),
    {
      latestAvailableEpisode: 4,
      availabilityConfidence: "confirmed"
    }
  );

  const bucket4 = makeCandidate(
    makeRecord({
      animeId: "b4",
      status: "planned",
      updatedAt: "2026-06-01T00:00:00.000Z"
    })
  );

  const bucket5Watching = makeCandidate(
    makeRecord({
      animeId: "b5w",
      status: "watching",
      watchedEpisodes: 1,
      updatedAt: "2026-01-01T00:00:00.000Z"
    }),
    {
      latestAvailableEpisode: 1,
      availabilityConfidence: "confirmed"
    }
  );

  const bucket5Paused = makeCandidate(
    makeRecord({
      animeId: "b5p",
      status: "paused",
      updatedAt: "2026-06-20T00:00:00.000Z"
    })
  );

  const tieOlder = makeCandidate(
    makeRecord({
      animeId: "tie-a",
      status: "planned",
      updatedAt: "2026-05-01T00:00:00.000Z"
    })
  );
  const tieNewerZ = makeCandidate(
    makeRecord({
      animeId: "tie-z",
      status: "planned",
      updatedAt: "2026-05-10T00:00:00.000Z"
    })
  );
  const tieNewerA = makeCandidate(
    makeRecord({
      animeId: "tie-a2",
      status: "planned",
      updatedAt: "2026-05-10T00:00:00.000Z"
    })
  );

  const shuffled = [
    bucket5Paused,
    bucket4,
    bucket1,
    tieOlder,
    bucket3,
    bucket2,
    tieNewerZ,
    bucket5Watching,
    tieNewerA
  ];

  const first = rankNextActions(shuffled, { now: NOW });
  const second = rankNextActions(shuffled, { now: NOW });

  assert.deepEqual(ids(first), [
    "b1",
    "b2",
    "b3",
    "b4",
    "tie-a2",
    "tie-z",
    "tie-a",
    "b5p"
  ]);
  assert.equal(JSON.stringify(first), JSON.stringify(second));

  assert.deepEqual(first[0], {
    anime: bucket1.record.anime,
    status: "watching",
    watchedEpisodes: 3,
    latestAvailableEpisode: 5,
    unwatchedEpisodes: 2,
    availabilityConfidence: "confirmed",
    provider,
    reasonLabel: "未記録のエピソードが2話あります",
    updatedAt: "2026-07-01T00:00:00.000Z"
  });
  assert.equal(first[0].anime, bucket1.record.anime);
  assert.equal(first[0].provider, provider);

  assert.deepEqual(first[1], {
    anime: bucket2.record.anime,
    status: "planned",
    watchedEpisodes: null,
    latestAvailableEpisode: 2,
    unwatchedEpisodes: null,
    availabilityConfidence: "estimated",
    provider: null,
    reasonLabel: "今週、新しいエピソードが配信された可能性があります",
    updatedAt: "2026-07-10T00:00:00.000Z"
  });

  assert.deepEqual(first[2], {
    anime: bucket3.record.anime,
    status: "watching",
    watchedEpisodes: 4,
    latestAvailableEpisode: 4,
    unwatchedEpisodes: 0,
    availabilityConfidence: "confirmed",
    provider: null,
    reasonLabel: "最近更新した視聴中の作品です",
    updatedAt: "2026-07-05T12:00:00.000Z"
  });

  assert.deepEqual(first[3], {
    anime: bucket4.record.anime,
    status: "planned",
    watchedEpisodes: null,
    latestAvailableEpisode: null,
    unwatchedEpisodes: null,
    availabilityConfidence: "unknown",
    provider: null,
    reasonLabel: "視聴予定に登録しています",
    updatedAt: "2026-06-01T00:00:00.000Z"
  });

  assert.equal(first[7].reasonLabel, "一時停止中の作品です");
  assert.equal(first[7].status, "paused");
  assert.equal(first[7].anime.id, "b5p");
});

test("bucket 5 watching label and confirmed episode arithmetic", () => {
  const candidate = makeCandidate(
    makeRecord({
      animeId: "old-watch",
      status: "watching",
      watchedEpisodes: 10,
      updatedAt: "2025-01-01T00:00:00.000Z"
    }),
    {
      latestAvailableEpisode: 12,
      availabilityConfidence: "confirmed"
    }
  );

  const [action] = rankNextActions([candidate], { now: NOW });
  assert.equal(action.unwatchedEpisodes, 2);
  assert.equal(action.reasonLabel, "未記録のエピソードが2話あります");

  const noUnwatched = makeCandidate(
    makeRecord({
      animeId: "caught-up",
      status: "watching",
      watchedEpisodes: 5,
      updatedAt: "2025-01-01T00:00:00.000Z"
    }),
    {
      latestAvailableEpisode: 5,
      availabilityConfidence: "confirmed"
    }
  );
  const [caughtUp] = rankNextActions([noUnwatched], { now: NOW });
  assert.equal(caughtUp.unwatchedEpisodes, 0);
  assert.equal(caughtUp.reasonLabel, "視聴中の作品です");
});

test("estimated never enters bucket 1 or numeric definitive reason", () => {
  const estimated = makeCandidate(
    makeRecord({
      animeId: "est",
      status: "watching",
      watchedEpisodes: 1,
      updatedAt: "2025-06-01T00:00:00.000Z"
    }),
    {
      latestAvailableEpisode: 4,
      availabilityConfidence: "estimated"
    }
  );

  const [action] = rankNextActions([estimated], { now: NOW });
  assert.equal(action.latestAvailableEpisode, 4);
  assert.equal(action.unwatchedEpisodes, 3);
  assert.equal(action.reasonLabel, "視聴中の作品です");
  assert.equal(action.reasonLabel.includes("未記録"), false);
});

test("unknown forces availability episode fields to null and never claims numeric unwatched", () => {
  const unknown = makeCandidate(
    makeRecord({
      animeId: "unk",
      status: "watching",
      watchedEpisodes: 2,
      updatedAt: "2025-06-01T00:00:00.000Z"
    }),
    {
      latestAvailableEpisode: 9,
      availabilityConfidence: "unknown"
    }
  );

  const [action] = rankNextActions([unknown], { now: NOW });
  assert.equal(action.latestAvailableEpisode, null);
  assert.equal(action.unwatchedEpisodes, null);
  assert.equal(action.watchedEpisodes, 2);
  assert.equal(action.reasonLabel, "視聴中の作品です");
  assert.match(action.reasonLabel, /視聴中の作品です/);
  assert.equal(/\d+話/.test(action.reasonLabel), false);
});

test("recent-window boundaries are inclusive for watching", () => {
  const atStart = makeCandidate(
    makeRecord({
      animeId: "edge-start",
      status: "watching",
      updatedAt: new Date(NOW.getTime() - 14 * DAY_MS).toISOString()
    })
  );
  const justBefore = makeCandidate(
    makeRecord({
      animeId: "before-start",
      status: "watching",
      updatedAt: new Date(NOW.getTime() - 14 * DAY_MS - 1).toISOString()
    })
  );
  const atNow = makeCandidate(
    makeRecord({
      animeId: "edge-now",
      status: "watching",
      updatedAt: NOW.toISOString()
    })
  );
  const afterNow = makeCandidate(
    makeRecord({
      animeId: "after-now",
      status: "watching",
      updatedAt: new Date(NOW.getTime() + 1).toISOString()
    })
  );

  const result = rankNextActions([justBefore, atStart, atNow, afterNow], {
    now: NOW,
    limit: 10
  });

  assert.equal(
    result.find((a) => a.anime.id === "edge-start")?.reasonLabel,
    "最近更新した視聴中の作品です"
  );
  assert.equal(
    result.find((a) => a.anime.id === "edge-now")?.reasonLabel,
    "最近更新した視聴中の作品です"
  );
  assert.equal(
    result.find((a) => a.anime.id === "before-start")?.reasonLabel,
    "視聴中の作品です"
  );
  assert.equal(
    result.find((a) => a.anime.id === "after-now")?.reasonLabel,
    "視聴中の作品です"
  );
});

test("invalid timestamps sort last and animeId tie-breaks ascending", () => {
  const invalidA = makeCandidate(
    makeRecord({
      animeId: "inv-a",
      status: "planned",
      updatedAt: "not-a-date"
    })
  );
  const invalidB = makeCandidate(
    makeRecord({
      animeId: "inv-b",
      status: "planned",
      updatedAt: "also-bad"
    })
  );
  const validOld = makeCandidate(
    makeRecord({
      animeId: "valid-old",
      status: "planned",
      updatedAt: "2020-01-01T00:00:00.000Z"
    })
  );

  const result = rankNextActions([invalidB, validOld, invalidA], { now: NOW });
  assert.deepEqual(ids(result), ["valid-old", "inv-a", "inv-b"]);
});

test("excludes completed, dropped, and null-anime records", () => {
  const completed = makeCandidate(
    makeRecord({
      animeId: "done",
      status: "completed",
      updatedAt: "2026-07-11T00:00:00.000Z"
    })
  );
  const dropped = makeCandidate(
    makeRecord({
      animeId: "drop",
      status: "dropped",
      updatedAt: "2026-07-11T00:00:00.000Z"
    })
  );
  const nullAnime = makeCandidate(
    makeRecord({
      animeId: "ghost",
      status: "watching",
      updatedAt: "2026-07-11T00:00:00.000Z",
      anime: null
    })
  );
  const kept = makeCandidate(
    makeRecord({
      animeId: "keep",
      status: "planned",
      updatedAt: "2026-07-01T00:00:00.000Z"
    })
  );

  const result = rankNextActions([completed, dropped, nullAnime, kept], { now: NOW });
  assert.deepEqual(ids(result), ["keep"]);
});

test("limit normalization: default 8, clamp 0-50, non-finite as 8", () => {
  const candidates = Array.from({ length: 12 }, (_, index) =>
    makeCandidate(
      makeRecord({
        animeId: `p${String(index).padStart(2, "0")}`,
        status: "planned",
        updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
      })
    )
  );

  assert.equal(rankNextActions(candidates, { now: NOW }).length, 8);
  assert.equal(rankNextActions(candidates, { now: NOW, limit: 3 }).length, 3);
  assert.equal(rankNextActions(candidates, { now: NOW, limit: 0 }).length, 0);
  assert.equal(rankNextActions(candidates, { now: NOW, limit: 100 }).length, 12);
  assert.equal(rankNextActions(candidates, { now: NOW, limit: 50 }).length, 12);
  assert.equal(rankNextActions(candidates, { now: NOW, limit: 3.9 }).length, 3);
  assert.equal(rankNextActions(candidates, { now: NOW, limit: Number.NaN }).length, 8);
  assert.equal(rankNextActions(candidates, { now: NOW, limit: Number.POSITIVE_INFINITY }).length, 8);
  assert.equal(rankNextActions(candidates, { now: NOW, limit: -2 }).length, 0);
});

test("does not mutate input candidates or nested records", () => {
  const anime = makeAnime("imm");
  const provider: StreamingProvider = { id: 1, name: "Crunchyroll", logoUrl: null };
  const record = makeRecord({
    animeId: "imm",
    status: "watching",
    watchedEpisodes: 1,
    updatedAt: "2026-07-01T00:00:00.000Z",
    anime
  });
  const candidate = makeCandidate(record, {
    latestAvailableEpisode: 3,
    availabilityConfidence: "confirmed",
    provider
  });

  const frozenAnime = Object.freeze(anime);
  const frozenProvider = Object.freeze(provider);
  const frozenRecord = Object.freeze({ ...record, anime: frozenAnime });
  const frozenCandidate = Object.freeze({
    ...candidate,
    record: frozenRecord,
    provider: frozenProvider
  });
  const input = Object.freeze([frozenCandidate]);

  const before = JSON.stringify(input);
  const result = rankNextActions(input, { now: NOW });
  const after = JSON.stringify(input);

  assert.equal(before, after);
  assert.equal(result[0].anime, frozenAnime);
  assert.equal(result[0].provider, frozenProvider);
  assert.equal(result[0].reasonLabel, "未記録のエピソードが2話あります");
});

test("non-integer or negative episode inputs normalize to null", () => {
  const candidate = makeCandidate(
    makeRecord({
      animeId: "bad-eps",
      status: "watching",
      watchedEpisodes: 1.5 as unknown as number,
      updatedAt: "2025-01-01T00:00:00.000Z"
    }),
    {
      latestAvailableEpisode: -1,
      availabilityConfidence: "confirmed"
    }
  );

  const [action] = rankNextActions([candidate], { now: NOW });
  assert.equal(action.watchedEpisodes, null);
  assert.equal(action.latestAvailableEpisode, null);
  assert.equal(action.unwatchedEpisodes, null);
  assert.equal(action.reasonLabel, "視聴中の作品です");
});
