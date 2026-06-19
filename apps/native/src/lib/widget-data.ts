import { selectTonightCandidates } from '@/lib/tonight-watch';
import type { AnimeStatusRecord } from '@/lib/statuses';

export type TonightWidgetProps = {
  headline: string;
  candidate1: string;
  candidate2: string;
  candidate3: string;
  detail1: string;
  detail2: string;
  detail3: string;
  updatedAt: string;
};

export function buildTonightWidgetProps(records: AnimeStatusRecord[]): TonightWidgetProps {
  const candidates = selectTonightCandidates(records, 'continue');

  if (candidates.length === 0) {
    return {
      headline: '今夜の候補なし',
      candidate1: '視聴中の作品を追加',
      candidate2: '',
      candidate3: '',
      detail1: 'Tier 表や Explore から追加できます',
      detail2: '',
      detail3: '',
      updatedAt: new Date().toISOString(),
    };
  }

  const [first, second, third] = candidates;

  return {
    headline: `今夜の候補 ${candidates.length}件`,
    candidate1: first?.record.anime?.title ?? '',
    candidate2: second?.record.anime?.title ?? '',
    candidate3: third?.record.anime?.title ?? '',
    detail1: first?.reason ?? '',
    detail2: second?.reason ?? '',
    detail3: third?.reason ?? '',
    updatedAt: new Date().toISOString(),
  };
}