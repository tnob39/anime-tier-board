# 方針③ 実装計画 N1–N4（精査版・Codexレビュー反映） — 2026-06-19

> **唯一の参照元**: `docs/UX_DIRECTION.md`「方針③（単一IA・4タブ統合）」
> **ベース**: `origin/main @ 88b3622`
> **進め方**: 各スライスは origin/main ベースの専用 worktree。**N1a → N1b → N1c の順で段階マージ**し、後続（N2/N3/N4）は N1c を取り込んでから着手して同一ファイル競合を回避する。実装は Grok/Codex 委任 → Codex レビュー。
> **2026-06-19 Codexレビュー反映済み**（全文は `tnob39/codex-policy3-review` ブランチの `REVIEW_POLICY3.md`）: N1 を N1a/N1b/N1c に分割（観点1 blocker）、独占表現を「加入中サービス内でここだけ」に限定（観点5 blocker）、カレンダー2層抽出・isSimple再配置・後方互換対象拡張・N4 順序を明確化。

---

## 0. 現状把握（コード根拠）

| 領域 | 現状 |
|------|------|
| モード | `lib/ui-mode.tsx`（`UiMode = simple\|pro`、localStorage `anime-tier-board:uiMode`、default `simple`） |
| `useUiMode` 消費 | **6箇所**: `app/home-client.tsx`(分岐) / `app/providers.tsx`(Provider) / `app/settings/settings-client.tsx`(切替UI) / `components/HamburgerMenu.tsx`(モードボタン) / `components/MobileNav.tsx`(タブ切替) / `components/TierBoardApp.tsx`(`isSimple`分岐) |
| 下部ナビ | `MobileNav.tsx`: SIMPLE=`ホーム/視聴中/探す/サブスク`、PRO=`ホーム/Tier/分析/探す` の2配列 |
| ホーム | `app/page.tsx` → `home-client.tsx`(mode分岐) → `home-simple.tsx`(143) / `home-pro.tsx`(198) / `home-guest.tsx`(32, 未ログイン) |
| 放映カレンダー | `WeeklyBroadcastCalendar` は `app/watchlist/watchlist-client.tsx`(**877行**) の内部関数(580行〜)。フロー: `visibleItems → calendarItems(watching/plannedのみ) → groupItemsByBroadcastDay → WeeklyBroadcastCalendar`。依存: `BROADCAST_WEEKDAYS` / `BroadcastWeekday` / `getBroadcastDayLabel` / `extractWeekdayLabel` / `normalizeBroadcastDay` / `CardLane` / `LaneCardData` / 今日レーンへの `scrollIntoView` |
| GlobalNav | ロゴ `<a href="/">`(フルリロード) + PC用ホームボタン `<Link href="/">`(`Home`アイコン, line47-48, class `global-nav-home-pc`) |
| 分析 / サブスク | `dashboard-client.tsx`(205) / `subscriptions-client.tsx`(454)。`/subscriptions` 導線は `MobileNav`/`HamburgerMenu`/`settings-client`/`dashboard-client`/`explore-client`/`updates`/`dashboard/changelog-section`/`app/manifest.ts`(PWA shortcut) に分散 |
| サブスク統計 | `lib/subscription-stats.ts` の `calcSubscriptionStats`、`getAnimeTmdbProviderIds`（TMDb JP flatrate + AniList `streamingPlatforms`/`streamingEpisodes` fallback）。加入対象は `STREAMING_SERVICES` の TMDb provider IDs のみ |

---

## N1 — IA一本化 + ホーム=放映カレンダー 【基盤・3分割で段階マージ】

> **Codex指摘(観点1, blocker)**: 旧 N1 は ui-mode撤去〜カレンダー抽出〜ホーム再構成〜isSimple撤去まで含み、レビュー単位として大きく原因分離が困難。**N1a/N1b/N1c に分割**する。

### N1a — モード撤去・単一ナビ化・ホームアイコン削除
- `lib/ui-mode.tsx` 撤去、`app/providers.tsx` の `UiModeProvider` 除去
- `MobileNav.tsx`: 単一4タブ `ホーム / Tier / 分析 / さがす` の1配列に。視聴中・サブスクのタブは外す
- `settings-client.tsx` / `HamburgerMenu.tsx`: モード切替UI削除
- `TierBoardApp.tsx`: `isSimple` 分岐を解消（**下記「N1aの isSimple 撤去方針」参照**）
- `GlobalNav.tsx`: `global-nav-home-pc`（右上ホームアイコン）削除。ロゴのトップ遷移は残す（ロゴの `<Link>` 化は N4 で扱う）
- **ホーム表示は一旦既存に寄せる**（カレンダー化は N1c）。最小限の暫定表示でよい
- 受け入れ条件: `rg "useUiMode|UiMode|isSimple"` がゼロ（`UiModeProvider` 除去後に `useUiMode` 残存は即 build error）。`anime-tier-board:uiMode` は migration/ignore 方針を明記。CSS の `.ui-mode-*` / `.hamburger-mode-*` 残骸も掃除

**N1aの `isSimple` 撤去方針（Codex観点3, important）**: pro 相当へ単純固定すると、simple で隠していた操作（年/期セレクト・映画OFF・旧作OFF・自動配置・リセット・Tier追加）が一気に露出し「シンプル優先」に反する。**単一UIとして一軍/二軍に再選別**する:
- 常時表示（一軍）: 年/期セレクト・`再取得`・`共有`
- 二次操作へ格納（二軍、モバイルは `⋯`/折りたたみ）: 映画OFF・旧作OFF・自動配置・リセット・Tier追加
- 自動配置ボタンの文言が現状 **「出刃表」** になっている疑い → 別途修正候補（N1a 内 or 別タスク）

### N1b — `WeeklyBroadcastCalendar` 抽出（watchlist 回帰維持）
> **Codex指摘(観点2, important)**: 単なる JSX でなく集計ロジック込み。**2層に分けて抽出**し、ホームにはまだ載せず watchlist の見た目・挙動を据え置きで比較する。
- `lib/broadcast-calendar.ts`: `BROADCAST_WEEKDAYS` / `BroadcastWeekday` / `normalizeBroadcastDay` / `getBroadcastDayLabel` / `groupItemsByBroadcastDay` を移設。入力 `AnimeStatusRecord[]` → 出力 `Record<BroadcastWeekday, AnimeStatusRecord[]>`
- `components/WeeklyBroadcastCalendar.tsx`: 表示のみ。props `grouped` / `onItemClick?` / `className?` / `heading?` を切り出し、watchlist と home で同一部品を使う
- 回帰確認: `watching/planned` のみ表示 / 曜日順 月→日 / `nextEpisode.airingAt` 優先・`broadcastDay` fallback / 今日レーンのハイライト+`scrollIntoView` / アイテム0件時は `null` を維持。ユニットテストは `groupItemsByBroadcastDay` に集中

### N1c — ホーム=放映カレンダー化
- `app/page.tsx` / `home-client` 系を再構成し、抽出した `WeeklyBroadcastCalendar` をホームFVに
- `home-pro` / `home-simple` を単一ホームへ統合
- 「視聴中 X本」ピル/進捗カードは置かない（方針③決定）
- カードタップ → 視聴管理編集への導線（/watchlist 該当編集 or モーダル）
- **空状態の暫定仕様**を決める: 「visible はあるが calendarItems がゼロ」のケースをどう出すか（watchlist 同様 `null` か、暫定プレースホルダか）。本格チュートリアルは N2 で上書き

**波及確認（N1全体）**: PWA App Shortcuts / `manifest.ts` の `start_url:"/"` の意味変更 / 共有URL / localStorage キーが `/`=カレンダー前提で破綻しないか。`home-guest`(未ログイン) の扱い。native アプリ側は今回 Web 方針のため対象外と明記

---

## N2 — 初回チュートリアル 【N1c後】

**目的**: 空ホーム（カレンダーに何も無い）状態で「まず視聴中を1本選ぶ」まで誘導（機能羅列で終わらせない）。

**スコープ**: 空状態判定 → チュートリアルUI（探す/今期から1本登録）→ 登録でカレンダー反映。localStorage で初回のみ表示。既存 `HomeAddSection` / explore 登録動線を流用。**カレンダー空状態と未登録状態の条件を N1c で定義した上で上書き**。storage 方針は N1a の `anime-tier-board:uiMode` 撤去と合わせて整理（不要キーを増やさない）。

**依存**: N1c。**リスク低〜中**、単独 worktree 可。

---

## N3 — 分析2セクション統合 + サブスク再設計 【N1c後・段階分割】

**目的**: `/dashboard` を ①サブスク分析 ②アニメタイプ分析 の2セクションに。`/subscriptions` を統合。

**段階分割**
- **N3a** ルーティング統合: `/subscriptions`(ページルート) → `/dashboard` の **server redirect**。同時に後方互換（下記）を処理。`/api/subscriptions`(設定保存API) は**残す**
- **N3b** サブスク分析セクション: 「ウォッチリストの何%が見放題か」+「独占（加入中サービス内でここだけ）」を `/dashboard` に実体化。謎の「見放題カバー率」カード（→/subscriptions に飛ぶだけ）を廃止し中身を移植・再設計
- **N3c** アニメタイプ分析セクション: ジャンル/声優/視聴ステータス傾向（既存 `dashboard-client` 資産流用）
- **N3d** 統合後に残す部品の CSS/不要機能整理（inline style 乱用・リング等。「旧 subscriptions page 整理」ではなく統合後クリーンアップとして扱う）

**後方互換（Codex観点4, important — 計画より広い）**:
- `app/manifest.ts` の PWA shortcut URL を `/dashboard` に変更（名称も「分析」/「サブスク分析」へ）
- `settings-client` / `explore-client` / `dashboard-client` / `HamburgerMenu` の `/subscriptions` リンクを `/dashboard` に変更
- `updates` / `changelog-section` の過去リンクは履歴として残す選択可。ただし redirect で到達できることを確認
- `/dashboard?section=subscriptions` のような anchor/クエリを用意し、旧導線からサブスク分析セクションへ着地
- 注意: `SubscriptionsClient` は `router.replace("/subscriptions?...")` で内部状態URLを更新している。redirect 後に旧ページコードを残すと状態URLが古いままになる点に留意
- 注意: `/dashboard` は未ログイン redirect + `subscriptionState.onboardingDone` による `/onboarding` redirect がある。統合後「分析を見る前に必ずサブスク onboarding へ飛ぶ」設計でよいか再確認

**独占「ここだけ」算出（Codex観点5, blocker — 誤表示リスク）**: 現データ（TMDb JP flatrate + AniList fallback、加入は `STREAMING_SERVICES` のみ）では「世の中の全サービスで独占」は言えない。
- 表示名は **「加入中サービス内でここだけ」/「あなたのサブスクではここだけ」** に限定
- 算出は `subscribedCoverage` ベース。各 anime で加入中 service のうち match が1つだけなら exclusive
- 「他サービスでも配信あり」は TMDb flatrate 全体の providerIds と比較できる場合のみ補足表示
- fallback 由来（AniList platform/episode alias）の providerIds は `source: "tmdb"|"fallback"` を持たせ信頼度を下げる。**独占判定は原則 TMDb flatrate に限定**
- `STREAMING_SERVICES` 未登録の TMDb provider が `flatrate` に含まれる場合は「ここだけ」から除外 or 「加入中ではここだけ」と表現

**リスク**: 中〜高（`subscriptions-client` 454行 + `dashboard` 205行の統合）。N3a→N3b→N3c→N3d の段階コミット。

---

## N4 — プリフェッチ最適化 【一部 N1 並行可・merge は N1c 後】

> **Codex指摘(観点6)**: SSR seed/sessionStorage は一見独立だが、N1 がホーム構造とカード導線を変えるため prefetch の呼び出し位置・seed キー・カード対象が変わる。**完全並行は二重実装/競合の恐れ**。

**スコープ（section7 推奨）**
- **N4a** `/tier` の SSR seed（季節データをサーバ側で初期投入）+ 季節キャッシュの sessionStorage 永続化 — **ホーム導線に触れない範囲のみ N1 と並行着手可。merge は N1c 後推奨**
- ホームのカード押下を `Link` 化 or `router.prefetch` — **ホーム実装が N1c で変わるため N1c 後**
- `GlobalNav` ロゴの `<Link>` 化（フルリロード停止）

**リスク低〜中**。

---

## 並行・順序（Codex反映版）

```
1. N1a  モード撤去・単一ナビ・GlobalNav ホームアイコン削除
2. N1b  カレンダー2層抽出のみ（watchlist 回帰確認）
3. N1c  ホーム=カレンダー化（カードタップ導線・空状態 暫定仕様）
4. N4a  /tier SSR seed + sessionStorage（N1c のホーム変更に触れない範囲。merge は N1c 後）
5. N2   初回チュートリアル（N1c の空状態仕様を上書き）
6. N3a→N3b→N3c→N3d  dashboard/subscriptions 統合
```

N1a が IA/ナビの土台＝競合の源なので最優先で単独マージ。

---

## Issue 化案

- **N1a** → 新Issue（EPIC #65 子）: 「方針③ N1a: モード撤去・単一4タブ・ホームアイコン削除」
- **N1b** → 新Issue: 「方針③ N1b: WeeklyBroadcastCalendar 2層抽出（watchlist 回帰維持）」
- **N1c** → 新Issue: 「方針③ N1c: ホーム=放映カレンダー化」
- **N2** → 新Issue: 「方針③ N2: 初回チュートリアル」
- **N3** → 新Issue（N3a–d はチェックリスト）: 「方針③ N3: 分析2セクション+サブスク統合・独占算出」
- **N4** → 新Issue: 「方針③ N4: プリフェッチ最適化」
- **旧Issue整理**: #69(Tierモバイル) / #70(サブスクFV) / #71(分析) / #44(今夜ピン) は方針③で扱いが変わる → 各Issueに「方針③に吸収・再定義」とコメントし方針③Issueへ誘導（クローズ判断は別途）

---

## 受け入れ条件（共通）

- `npx tsc --noEmit` / `npm run build` 通過
- `rg "useUiMode|UiMode|anime-tier-board:uiMode|/subscriptions"` で残存確認。ただし `/api/subscriptions` と更新履歴リンクは**意図的残存として例外リスト化**
- 各スライスは origin/main（または前段スライス）ベースの専用 worktree
