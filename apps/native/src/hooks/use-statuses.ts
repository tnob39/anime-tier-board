import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { deleteStatus, fetchStatuses, saveStatus } from '@/lib/api-client';
import type { AnimeStatusRecord, ViewingStatus } from '@/lib/statuses';
import type { AnimeItem } from '@/lib/types';

export function useStatuses() {
  const { token, user, handleUnauthorized } = useAuth();
  const [records, setRecords] = useState<AnimeStatusRecord[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ViewingStatus>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!token || !user) {
      refreshGenerationRef.current += 1;
      setRecords([]);
      setStatusMap({});
      return;
    }

    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;
    setLoading(true);
    setError(null);

    try {
      const nextRecords = await fetchStatuses(token, handleUnauthorized);
      if (generation !== refreshGenerationRef.current) {
        return;
      }

      setRecords(nextRecords);
      setStatusMap(
        Object.fromEntries(nextRecords.map((record) => [record.animeId, record.status]))
      );
    } catch (e: unknown) {
      if (generation !== refreshGenerationRef.current) {
        return;
      }

      setError(e instanceof Error ? e.message : 'ステータス取得に失敗しました。');
    } finally {
      if (generation === refreshGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [token, user, handleUnauthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateStatus = useCallback(
    async (anime: AnimeItem, status: ViewingStatus | null) => {
      if (!token) {
        throw new Error('ログインが必要です。');
      }

      const previousRecord = records.find((record) => record.animeId === anime.id) ?? null;

      if (status) {
        const existing = records.find((record) => record.animeId === anime.id);
        const nextRecord: AnimeStatusRecord = existing
          ? { ...existing, status, anime }
          : {
              animeId: anime.id,
              status,
              anime,
              favoriteLevel: null,
              watchSlot: null,
              notes: null,
              watchedEpisodes: null,
              updatedAt: new Date().toISOString(),
            };

        setRecords((current) => {
          const index = current.findIndex((record) => record.animeId === anime.id);
          if (index < 0) {
            return [nextRecord, ...current];
          }
          return current.map((record) => (record.animeId === anime.id ? nextRecord : record));
        });
        setStatusMap((current) => ({ ...current, [anime.id]: status }));
      } else {
        setRecords((current) => current.filter((record) => record.animeId !== anime.id));
        setStatusMap((current) => {
          const next = { ...current };
          delete next[anime.id];
          return next;
        });
      }

      setSavingId(anime.id);
      setError(null);

      try {
        if (status) {
          await saveStatus(token, anime.id, status, anime, handleUnauthorized);
        } else {
          await deleteStatus(token, anime.id, handleUnauthorized);
        }
      } catch (e: unknown) {
        if (previousRecord) {
          setRecords((current) => {
            const withoutCurrent = current.filter((record) => record.animeId !== anime.id);
            return [previousRecord, ...withoutCurrent];
          });
          setStatusMap((current) => ({ ...current, [anime.id]: previousRecord.status }));
        } else {
          setRecords((current) => current.filter((record) => record.animeId !== anime.id));
          setStatusMap((current) => {
            const next = { ...current };
            delete next[anime.id];
            return next;
          });
        }

        const message = e instanceof Error ? e.message : 'ステータス保存に失敗しました。';
        setError(message);
        throw e;
      } finally {
        setSavingId(null);
      }
    },
    [token, records, statusMap, handleUnauthorized]
  );

  return {
    records,
    statusMap,
    loading,
    savingId,
    error,
    refresh,
    updateStatus,
    isAuthenticated: Boolean(token && user),
  };
}