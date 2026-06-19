# 方針③ 実装計画 N1–N4（精査版） — 2026-06-19

> **唯一の参照元**: `docs/UX_DIRECTION.md`「方針③（単一IA・4タブ統合）」
> **ベース**: `origin/main @ 88b3622`
> **進め方**: 各スライスは origin/main ベースの専用 worktree。**N1 を先行単独マージ**し、後続（N2/N3/N4）は N1 を取り込んでから着手して同一ファイル競合を回避する。実装は Grok/Codex 委任 → Codex レビュー。

---

## 0. 現状把握（コード根拠）

| 領域 | 現状 |
|------|------|
| モード | `lib/ui-mode.tsx`（`UiMode = simple\|pro`、localStorage `anime-tier-board:uiMode`、default `simple`） |
| `useUiMode` 消費 | **6箇所**: `app/home-client.tsx`(分岐) / `app/providers.tsx`(Provider) / `app/settings/settings-client.tsx`(切替UI) / `components/HamburgerMenu.tsx`(モードボタン) / `components/MobileNav.tsx`(タブ切替) / `components/TierBoardApp.tsx`(`isSimple`分岐) |
| 下部ナビ | `MobileNav.tsx`: SIMPLE=`ホーム/視聴中/探す/サブスク`、PRO=`ホーム/Tier/分析/探す` の2配列 |
| ホーム | `app/page.tsx` → `home-client.tsx`(mode分岐) → `home-simple.tsx`(143) / `home-pro.tsx`(198) / `home-guest.tsx`(32, 未ログイン) |
| 放映カレンダー | `WeeklyBroadcastCalendar` は `app/watchlist/watchlist-client.tsx`(**877行**) の内部関数(580行〜)。依存: `broadcastCalendar.grouped` / `TODAY_JA` / `BROADCAST_WEEKDAYS` / `normalizeBroadcastDay` / `card-lane` CSS |
| GlobalNav | ロゴ `<a href="/">`(フルリロード) + PC用ホームボタン `<Link href="/">`(`Home`アイコン, line47-48, class `global-nav-home-pc`) |
| 分析 / サブスク | `dashboard-client.tsx`(205) / `subscriptions-client.tsx`(454) |

---

## N1 — IA一本化 + ホーム=放映カレンダー 【基盤・先行単独マージ】

**目的**: モード（simple/pro）を撤廃して単一4タブ化し、ホームを放映カレンダーにする土台を作る。

**スコープ**
1. **モード撤去**
   - `lib/ui-mode.tsx` を撤去（or no-op化）、`app/providers.tsx` の `UiModeProvider` 除去
   - `MobileNav.tsx`: 単一4タブ `ホーム / Tier / 分析 / さがす` の1配列に。視聴中・サブスクのタブは外す
   - `home-client.tsx`: mode分岐撤去。`home-pro` / `home-simple` を単一ホームへ統合（カレンダー主体に作り替え）
   - `settings-client.tsx` / `HamburgerMenu.tsx`: モード切替UI削除
   - `TierBoardApp.tsx`: `isSimple` 分岐を解消（pro相当に固定で良いか要判断 → レビュー観点③）
2. **ホーム=放映カレンダー**
   - `WeeklyBroadcastCalendar` を `watchlist-client.tsx` から `components/WeeklyBroadcastCalendar.tsx` に抽出（共通部品化）。依存ユーティリティ（`normalizeBroadcastDay` 等）も `lib/` へ切り出し
   - `watchlist-client.tsx` は抽出部品を import して従来表示を維持（回帰防止）
   - `app/page.tsx` / ホームをカレンダーFVに。**視聴中ピル/進捗カードは置かない**（方針③決定）
   - カードタップ → 視聴管理編集への導線（/watchlist の該当編集 or モーダル）
3. **GlobalNav**: `global-nav-home-pc`（右上ホームアイコン）削除。ロゴのトップ遷移は残す

**波及確認**: PWA App Shortcuts / 共有URL / localStorage キーが `/`=カレンダー前提で破綻しないか。`anime-tier-board:uiMode` キーの後始末。`home-guest`(未ログイン) の扱い

**リスク**: `watchlist-client`(877行) からの抽出は回帰リスク高 → カレンダー部品を watchlist と home 双方で同一表示に保つ。`TierBoardApp` の `isSimple` 撤去は Tier UI に影響しうる

**受け入れ条件**: 単一4タブ表示 / ホームにカレンダー / モード関連UI・コード消滅 / watchlist のカレンダー従来通り / `tsc`・`build` 通過

---

## N2 — 初回チュートリアル 【N1後】

**目的**: 空ホーム（カレンダーに何も無い）状態で「まず視聴中を1本選ぶ」まで誘導（機能羅列で終わらせない）。

**スコープ**: 空状態判定 → チュートリアルUI（探す/今期から1本登録）→ 登録でカレンダー反映。localStorage で初回のみ表示。既存 `HomeAddSection` / explore 登録動線を流用。

**依存**: N1 のホーム/カレンダー構造。**リスク低〜中**、単独 worktree 可。

---

## N3 — 分析2セクション統合 + サブスク再設計 【N1後・大きめ→段階分割】

**目的**: `/dashboard` を ①サブスク分析 ②アニメタイプ分析 の2セクションに。`/subscriptions` を統合。

**段階分割（推奨）**
- **N3a** ルーティング統合: `/subscriptions` → `/dashboard` リダイレクト。ナビからサブスクタブ撤去（N1 で撤去済みなら確認のみ）
- **N3b** サブスク分析セクション: 「ウォッチリストの何%が見放題か」+「ここでしか見られない（独占）」を `/dashboard` に実体化。謎の「見放題カバー率」カード（→/subscriptions に飛ぶだけ）を廃止し中身を移植・再設計
- **N3c** アニメタイプ分析セクション: ジャンル/声優/視聴ステータス傾向（既存 `dashboard-client` 資産流用）
- **N3d** サブスクページのデザイン崩れ（inline style 乱用・リング等）整理・不要機能削除

**独占「ここだけ」算出**: 各作品の配信プロバイダ集合から、加入サブスクのみで視聴可（=他では不可）の作品を抽出。`getAnimeTmdbProviderIds` 等の既存資産を流用。

**リスク**: 中〜高（`subscriptions-client` 454行 + `dashboard` 205行の統合）。N3a→N3b→N3c→N3d の段階コミット推奨。

**受け入れ条件**: `/dashboard` に2セクション / `/subscriptions` リダイレクト / カバー率%・独占が実数表示 / `tsc`・`build` 通過。

---

## N4 — プリフェッチ最適化 【独立・一部 N1 並行可】

**目的**: `docs/UX_DIRECTION.md` section7 の調査結論を実装。/tier・カード押下の先読みを効かせる。

**スコープ（section7 推奨）**
- `/tier` の SSR seed（季節データをサーバ側で初期投入）
- ホームのカード押下を `Link` 化 or `router.prefetch`
- 季節キャッシュの sessionStorage 永続化（モジュール Map=ページロード単位の消失を解消）

**依存**: SSR seed / sessionStorage 部分は N1 と並行着手可。カード先読みはホーム実装が N1 で変わるため N1 後が安全。**リスク低〜中**。

---

## 並行・順序

```
N1（基盤・単独マージ）
  └─ マージ後 → N2 / N3 / N4 を各 worktree で並行
N4 の SSR seed・sessionStorage 部分は N1 と並行着手可
```

N1 が IA/ホーム/ナビの土台＝競合の源なので最優先で単独マージ。

---

## Issue 化案

- **N1** → 新Issue（EPIC #65 子）: 「方針③ N1: IA一本化+ホーム=放映カレンダー」
- **N2** → 新Issue: 「方針③ N2: 初回チュートリアル」
- **N3** → 新Issue（N3a–d はチェックリスト or 別Issue分割）: 「方針③ N3: 分析2セクション+サブスク統合・独占算出」
- **N4** → 新Issue: 「方針③ N4: プリフェッチ最適化」
- **旧Issue整理**: #69(Tierモバイル) / #70(サブスクFV) / #71(分析) / #44(今夜ピン) は方針③で扱いが変わる → 方針③Issue に吸収 or クローズ判断

---

## Codex レビュー観点（依頼事項）

1. **N1 の分割粒度**は適切か（大きすぎ→分割すべきか）。特に「モード撤去」と「ホーム=カレンダー化」を1スライスにまとめるリスク
2. `WeeklyBroadcastCalendar` 抽出の**回帰リスク低減策**
3. `TierBoardApp` の `isSimple` 撤去で **pro固定にして良いか**（simple でしか出ていない要素の喪失リスク）
4. `/subscriptions`→`/dashboard` 統合の**段階・後方互換**（既存ブックマーク/共有URL/PWA shortcut）
5. 独占「ここだけ」算出ロジックの**妥当性とデータ前提**
6. N1–N4 の**順序・並行性**、見落としている波及（PWA / localStorage / SSR）
