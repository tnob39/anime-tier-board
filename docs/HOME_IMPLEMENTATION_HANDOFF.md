# HOME_IMPLEMENTATION_HANDOFF.md — モード別ホーム実装 引き継ぎ

> **目的**: アンケート結果を反映したモード別ホーム実装の状態を、別セッション／別エージェント（Grok build 等）に渡すための引き継ぎ書。
> **最終更新**: 2026-06-14 / 状態: 🟢 実装完了・未マージ（検証とリリースが残）

---

## 1. ブランチと現在地

- **ブランチ**: `feature/onboarding-ux-inline`（push 済み・最新 `ace592b`）
- **ベース**: main（v1.7 + survey をマージ統合済み）
- **状態**: 実装完了。`npx tsc --noEmit` / `npm run build` **通過済み**。**未マージ**。
- **worktree**: `C:\Users\Nobu\.claude\anime-tier-board\worktrees\onboarding-ux`

## 2. 実装済みの内容

根拠: [PRODUCT_CONCEPT.md](./PRODUCT_CONCEPT.md) / [HOME_DESIGN_OPTIONS.md](./HOME_DESIGN_OPTIONS.md) / アンケート結果(n=5: C案最多・サブスク派/ヘビー層)。

| 領域 | ファイル | 内容 |
|------|---------|------|
| DB拡張 | `lib/statuses.ts` | `watched_episodes`(視聴済み話数) 追加。型 `AnimeStatusRecord.watchedEpisodes`、`updateTrackingDetails`、`listStatuses` 対応 |
| 保存API | `app/api/watchlist/route.ts` | PUT で `watchedEpisodes` 受領 |
| 入力UI | `app/watchlist/watchlist-client.tsx` | 「何話まで見た」ステッパー（−/＋、上限=総話数） |
| 算出ロジック | `lib/home-data.ts`（新規・純粋関数） | `selectCatchup` / `unwatchedCount` / `totalUnwatched` / `selectRecentRecords` / `selectComingSoon` / `latestAvailableEpisode` |
| モード分岐 | `app/home-client.tsx` | `useUiMode()` で simple/pro を出し分け |
| シンプル(S3) | `app/home-simple.tsx` | 今すぐ見られる→これから配信→見たい。`HomeEmptyGuide` も export |
| プロ(C案P3) | `app/home-pro.tsx` | 進捗バー＋今すぐ見られる＋最近の記録フィード＋Tierリンク |
| 共通部品 | `components/AnimeList.tsx` | 縦リスト（`meta` 対応）。`components/AppShell.tsx`（公開パスでナビ非表示） |
| スタイル | `app/globals.css` | `.anime-list/.anime-row`、`.home-pro-*`、`.home-guide`、survey系 |

## 3. 残作業（= 次にやること）

1. **動作確認**（ローカル `npm run dev:local`）:
   - 設定 or `localStorage["anime-tier-board:uiMode"]` で simple/pro を切替し、両ホームを目視
   - watchlist で「何話まで見た」を入力 → 保存 → ホーム「今すぐ見られる」「未視聴◯話」に反映されるか
   - シンプル: 今すぐ見られる/これから配信/見たい の3段が出るか
   - プロ: 進捗バー・記録フィード（星+メモ）・Tierリンク が出るか
2. **PR作成 → main マージ → Vercel デプロイ**
3. **/updates に v1.8 として追記**（CLAUDE.md ルール。モード別ホーム刷新）
4. （任意）アンケートバナーは home-simple/home-pro 両方に設置済み。WelcomeModal は本ブランチで廃止済み（AppShell 化）

## 4. 注意点・既知の制約

- **進捗バー/キャッチアップは `watched_episodes` 入力が前提**。未入力だと「全話未視聴」とみなされる（`watchedEpisodes` null → 0 扱い）。初期は数字が大きく出るので、watchlist で入力を促す導線があると良い。
- 「配信済み最新話」は `airing.nextEpisode.episode - 1` で**近似**（正確な配信日は持っていない）。
- 配信サービス名は `streamingProvidersJp.flatrate[0].name`（enrich 済みレコードのみ）。
- ナビのモード別出し分けは**未実装**（下部ナビは現状の4本固定）。HOME_DESIGN_OPTIONS §5 の宿題として残っている。

## 5. 実装体制メモ

- 本実装は **Sonnet サブエージェントに分割委譲**（DB拡張 / 入力UI / lib / S3 / P3）、統合・コンフリクト解決・検証はメイン(Opus)が担当。
- **今後の方針**: コーディングはサブエージェント経由で **Grok build** を呼び出す形に移行予定（ユーザーが別途プランを検証中）。本ブランチはその移行前の成果物。
