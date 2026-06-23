# 画面構成検討 — Annict風ワイヤーフレーム比較（2026-06-22）

> 入力資料:
> - [docs/research/anime_app_spec_wireframes.html](../docs/research/anime_app_spec_wireframes.html)（Annictインスパイアのワイヤーフレーム＝競合UIの参考像。numanie自体の実装案ではない）
> - [docs/research/market-annict-competitor-20260622.md](../docs/research/market-annict-competitor-20260622.md)（Annict競合分析）
> - [plans/native-web-monetization-brainstorm-20260622.md](./native-web-monetization-brainstorm-20260622.md)（決済導線・ネイティブ差別化の決定）
>
> 前提: numanieの現行IAは [docs/UX_DIRECTION.md](../docs/UX_DIRECTION.md) **方針③（2026-06-19決定・単一4タブ: ホーム/Tier/分析/さがす）** が最優先・確定済み。本検討は**方針③を上書きしない**。ナビ構成の変更は提案しない。

---

## 1. 現状確認（コード調査結果）

| 項目 | numanieの現状 |
|------|---------------|
| 作品個別の詳細ページ | **無い**。`app/anime/[id]/page.tsx` のような独立ルートは存在しない。Tier表・Watchlist・分析のカード単位で完結する設計 |
| 視聴ステータス変更 | `app/watchlist/watchlist-client.tsx` の `WatchlistCard` でチップUI（見たい/視聴中/視聴済/中断等）。Tier表側にもバッジ表示あり |
| 配信サービス・アフィリエイト | `lib/streaming-services.ts` に `STREAMING_SERVICES` マスタ・`affiliateUrl` フィールドは**実装済みだが全件 `null`**（提携審査待ち、現状は `homeUrl` にフォールバック）。リダイレクト用 `/api/go/[serviceId]` も用意済み |
| サブスク診断（`/dashboard`・`/subscriptions`） | サービス単位（カバー率%）＋**作品単位の一覧（covered/uncovered）も既にある**。ただしcovered作品のリンクは現状AniList(`siteUrl`)止まりで、自社アフィリエイトリダイレクトには未接続 |
| 下部ナビ | `ホーム/Tier/分析/さがす` の4タブ固定（件数表示なし） |
| 社会的証明（人気度・評価） | `components/TierBoardApp.tsx` の `ReputationBadges` で評価・人気・お気に入り数を**既に表示済み**（AniList/Jikan由来） |

---

## 2. ワイヤーフレームから読み取れる「Annict風UI」の特徴

`anime_app_spec_wireframes.html` はAnnictにインスパイアされた構成で、以下が中心：
1. 5タブ構成（メニュー/ホーム/記録する/ライブラリ/今期アニメ）— **記録専用タブ**を持つ
2. **作品詳細ページが最重要画面**として独立し、そこにアフィリエイトボタン（U-NEXT/ABEMA/Amazon Prime/Disney+）を集中配置
3. ライブラリ画面はステータス別タブ＋件数（見てる12/見たい34/見た87/中断5）
4. 詳細ページのステータス切替は、キービジュアル下に浮かせたピル型トグル

## 3. numanieへの示唆 — 何を取り入れ、何を取り入れないか

### 3.1 取り入れない（既存決定・既存優位を維持）
- **5タブ/記録専用タブ・独立詳細ページ化**: 方針③（単一4タブ・1画面1主アクション）に反する。Annict的な「ページ遷移の多さ」を真似る必要はない（[market-annict-competitor-20260622.md](../docs/research/market-annict-competitor-20260622.md) §2.2-4でも、開発者文化に最適化されたUIが「凝りすぎ」の根拠として指摘済み）。
- **社会的証明バッジ**: すでに `ReputationBadges` で実装済み。ワイヤーフレームの「視聴者数2,852・評価4.8」は新規アイデアではない。

### 3.2 取り入れる価値がある（新規・具体的な改善候補）

#### (a) 作品単位の「今すぐ見る」アクション — 最重要
ワイヤーフレームの本質的な強みは「**作品ごとに見る場所への導線が一目で出る**」こと。numanieは現状、配信導線が `/subscriptions` ページに集約されており、**Tier表やWatchlistを見ている瞬間（＝最も視聴意欲が高い瞬間）には配信リンクが出ない**。

→ **提案**: 独立ページ化はせず、Tier表/Watchlistカードのタップで開く**軽量モーダル/ボトムシート**に、その作品が見られる配信サービス（affiliateリンク付き）を表示する。
- 方針③の「1画面1主アクション・二次操作は畳む」原則と整合（モーダルは“畳んだ”二次操作）。
- [native-web-monetization-brainstorm-20260622.md](./native-web-monetization-brainstorm-20260622.md) で決定した「アフィリエイトはWeb/ネイティブ両方で問題なし」をもっとも効果が出る場所（視聴意欲が最大の瞬間）に配置する形になる。
- 既存の `covered/uncovered` 集計・`/api/go/[serviceId]` リダイレクトの導線をそのまま転用できる（新規API不要、表示場所の追加のみ）。

#### (b) ライブラリ（Watchlist）のステータス件数表示
ワイヤーフレームの「見てる12／見たい34／見た87／中断5」は、**カジュアル層が「今どれだけ溜まっているか」を一目で把握できる**小さいが効果的な改善。numanieの `WatchlistCard` のステータスチップに件数バッジを追加するのは低コストで効果が見込める。

#### (c) covered作品リンクのアフィリエイト接続（バグ気味の未接続を解消）
調査で判明: `/subscriptions` の covered 作品一覧は現状 AniList の `siteUrl` にリンクしており、**自社アフィリエイトリダイレクト(`/api/go/[serviceId]`)を経由していない**。affiliateUrl投入後に効果を出すには、ここを `/api/go/[serviceId]` 経由に直す必要がある（実装自体は小さい）。

---

## 4. 優先度

| 提案 | 優先度 | 理由 |
|------|--------|------|
| (a) 作品単位「今すぐ見る」モーダル | 高 | 視聴意欲最大の瞬間にアフィリエイト導線を置ける。Annictにはこの導線が無い＝直接の差別化 |
| (c) covered作品リンクのアフィリエイト接続 | 高 | (a)を作る前提として必要。affiliateUrl投入後すぐ効果が出る範囲 |
| (b) ステータス件数バッジ | 中 | 低コストの体験改善。カジュアル層向け |
| 5タブ化・詳細ページ独立 | 採用しない | 方針③と矛盾。Annictの「凝りすぎ」UIを模倣する方向 |

## 5. 次のアクション（未着手・要オーナー判断）
- [ ] (a)(c) をセットでIssue化するか検討（実装はaffiliateUrl投入＝提携審査完了後が前提、現状は審査待ちのため着手タイミングは要相談）
- [ ] (b) は単独で先行実装可能（提携審査と無関係）
