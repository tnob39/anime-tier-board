import { useCallback, useEffect, useState } from 'react';

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

  const refresh = useCallback(async () => {
    if (!token || !user) {
      setRecords([]);
      setStatusMap({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextRecords = await fetchStatuses(token, handleUnauthorized);
      setRecords(nextRecords);
      setStatusMap(
        Object.fromEntries(nextRecords.map((record) => [record.animeId, record.status]))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ステータス取得に失敗しました。');
    } finally {
      setLoading(false);
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

      const previousRecords = records;
      const previousMap = statusMap;

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
        setRecords(previousRecords);
        setStatusMap(previousMap);
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