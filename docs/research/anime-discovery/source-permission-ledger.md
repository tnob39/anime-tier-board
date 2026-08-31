# Source permission ledger — screenshot recognition

Pinned SHA: `7b3de096d33ee8e7c025ff73072d1191cfc0f308`  
Reviewed: 2026-08-31  
Issue: #760  
Machine copy: [source-permission-ledger.json](./source-permission-ledger.json)

分類は `allowed / permission-required / unknown / prohibited` のみ。根拠が足りない項目は **unknown** または **permission-required** とし、推測で `allowed` にしない。

`production_usable` は `decision === "allowed"` のときだけ true にできる。現行 ledger はすべて false。

## 要約

| id | decision | production | 確認日 |
|----|----------|------------|--------|
| anilist | permission-required | no | 2026-08-31 |
| jikan | unknown | no | 2026-08-31 |
| official-pv | permission-required | no | 2026-08-31 |
| trace-moe | permission-required | no | 2026-08-31 |
| unauthorized-full-episode-index | prohibited | no | 2026-08-31 |

## anilist

- Role: マッチ後の title / id 正規化（認識エンジンそのものではない）
- ToS: https://docs.anilist.co/guide/terms-of-use （2026-08-31）
- robots: https://anilist.co/robots.txt — `Allow: /`。AI-train=no, search=yes, use=reference（2026-08-31）
- API docs: https://docs.anilist.co/guide/introduction
- 商用: 非商用は無料。商用は月次売上 USD 150 未満なら追加許諾不要、以上は `contact@anilist.co` でライセンス。競合する list/tracker は禁止（例外は個別認可）
- 保存: API を backup / ストレージに使うこと、hoarding / mass collection は禁止
- 再配布: 一般的な再配布許諾は見当たらない
- 帰属: 単独名称 "AniList" / "AniChart" は禁止
- Rate limit: 文書上 90 req/min。GitBook（2026-08-31）は一時的に 30 req/min と警告。429 + Retry-After。raise 申請は受付停止
- SLA: なし。障害時に制限強化・停止があり得る（https://docs.anilist.co/guide/considerations）
- 連絡先: contact@anilist.co / privacy@anilist.co
- 追加根拠: https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/rate-limiting.md , https://anilist.co/terms

## jikan

- Role: 非公式 MAL metadata
- ToS URL: https://jikan.moe/terms → **404**（2026-08-31）。jikan-rest#579 は 2022 年から壊れていると記録
- robots: https://jikan.moe/robots.txt — `User-agent: *` / `Disallow:`（空 = 許可と読めるが ToS 代替ではない）。`https://api.jikan.moe/robots.txt` は 404 JSON
- API docs: https://docs.api.jikan.moe/
- 商用: 生きた ToS が無いので **unknown**。docs は MAL ToS 遵守を利用者責任とする
- 再配布: REST 実装は MIT。MAL コンテンツ権は MIT では付与されない
- Rate limit: 3 req/s かつ 60 req/min。MAL 側制限もあり得る
- SLA: なし
- 連絡先: http://discord.jikan.moe
- 本リポジトリ: `docs/architecture/release-data-ssot.md` が Jikan Public API cutoff を規定。screenshot 経路の新規 live 依存は不可

## official-pv

- Role: 権利者許諾済みプロモ映像の fingerprint
- ToS（YouTube 経由の代表例）: https://developers.google.com/youtube/terms/api-services-terms-of-service （ページ表記 Last updated 2026-04-28 UTC、取得 2026-08-31）
- 関連: https://developers.google.com/youtube/terms/developer-policies , https://www.youtube.com/t/terms
- robots: 公式サイトごとに異なる。包括 URL は置けない（null）
- 商用 / 再配布: 作品ごとの権利者許諾が必要。YouTube API ToS は API 経由以外の視聴覚コンテンツ複製・配布ライセンスを与えない
- SLA: 自前 PV index に SLA なし。YouTube API は as-is
- 連絡先: 権利者ごと
- 既存 `data/source-permissions.v1.json` の公式ドメイン多くは unknown。一括 allowed にしない

## trace-moe

- Role: スクリーンショット → 話数 / 時刻候補
- ToS: https://trace.moe/terms （2026-08-31）— DMCA 手続きと「アップロード画像は即時削除」
- robots: https://trace.moe/robots.txt — `User-agent: *` / `Disallow: /*?*`（クエリ付き URL を禁止）
- API docs: https://soruly.github.io/trace.moe-api/ および https://github.com/soruly/trace.moe-api/blob/master/docs/docs.md
- 商用: 商用ライセンス条文は見当たらない。API key（`x-trace-key`）は quota 増であり契約の代替ではない → **permission-required**
- 保存: 検索アップロードは即時削除と主張。preview の image/video URL は 300 秒で失効
- 再配布: マッチした本編フレーム / preview / 裏にある episode index の再配布許諾は無い。docs の filename 例は episode encode に見える
- Rate limit: guest quota / concurrency。例: 100/24h。HTTP 402/503/504。本文 25MB 上限
- SLA: なし
- 連絡先: help@trace.moe

## unauthorized-full-episode-index

- Role: 無断本編 / 音声からの自前 index
- classification: **prohibited**
- 根拠: https://github.com/tnob39/anime-tier-board/issues/759 non-goals
- production: no
