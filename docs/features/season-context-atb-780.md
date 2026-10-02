# ATB-780 年＋クール文脈の監査と契約

正本: `lib/season.ts`（JST 境界・parser/serializer・previous/next・日本語ラベル・年範囲）。
URL 契約: `lib/season-url.ts`。共通 UI: `components/SeasonContextControl.tsx`。

境界は四半期開始の **00:00 JST**。ホストローカルタイムゾーンは使わない。

## 統一後の契約

| 項目 | 契約 |
|------|------|
| 今期 | クエリなし。JST の現在四半期。ラベル `今期（YYYY年X）` |
| 選択中の期 | `?year=YYYY&season=WINTER\|SPRING\|SUMMER\|FALL`。ラベル `選択中の期（YYYY年X）` |
| 自動判定 | セレクタ付近に `現在（YYYY年X）`、該当クールの選択肢には `（今期）` |
| season landing | `/seasons/YYYY/{winter\|spring\|summer\|fall}`（小文字スラッグのみ。既存 URL を維持） |
| 不正クエリ | 共通 parser が現在期へ fallback し、year/season を URL から除去。見出し・取得も現在期 |
| Explore 全年 | `?year=YYYY`（`season` なし）→ `/api/anime/seasonal?year=YYYY&season=all` |
| 対応ページ間 | GlobalNav / MobileNav が明示選択を `seasonAwareHref` で引き継ぐ |

## ページ／API 監査（path:line）

| 面 | 決定元 | URL | セレクタ | ラベル | 遷移保持 | 統一後 |
|----|--------|-----|----------|--------|----------|--------|
| Home | `app/page.tsx:32-39` が query を canonicalize。未指定は `getCurrentAnimeSeason` | `/?year=&season=` またはなし | `app/home-client.tsx:360` / `app/home-guest.tsx:76` | 今期 vs 選択中の期。今期/来期トグルはショートカット | nav + query | 選択期の追加レーンを取得。カレンダーは今期 SSR |
| Tier | `app/tier/page.tsx:19-26` + `components/TierBoardApp.tsx` の year/season state | `/tier?year=&season=` | `TierBoardApp` の `SeasonContextControl` | 今期なら h1 `今期アニメTier表`、それ以外は `YYYY年XアニメTier表` | query + popstate | 取得・見出し・URL が同一 ref |
| Explore | `app/explore/page.tsx:31` allowYearOnly。既定は全年 | `/explore?year=` または `year+season` | `explore-client.tsx:565`（全年オプションあり） | 全年は年スコープ。クール選択時は選択中の期 | query | 全年は `season=all`。クール指定時は一致 fetch |
| Watchlist | `app/watchlist/page.tsx:25-40` | `/watchlist?year=&season=` | `watchlist-client-v2-grok.tsx:551` | 暗黙時は今期/来期/その他。明示他期は選択中の期のみ | query。未ログインは returnTo に保持 | 今期バケツと選択中の期を混同しない |
| season landing | `app/seasons/[year]/[season]/page.tsx:38` `parseSeasonPathParts` | `/seasons/YYYY/season` 小文字 | `page.tsx:173` path ナビ | h1 は SEO 用 `YYYY年Xアニメ`。近接で今期を明示。前期/今期/来期チップは実今期基準 | path。CTA は query 付き Home/Tier | 不正パスは 404（レガシー） |
| Dashboard | 季節依存データなし `app/api/dashboard/route.ts:6-8` | 分析自体は season 非依存 | なし | なし | nav が query を付けて往復可能 | セレクタは置かない |
| Tier 共有 | `app/share/[shareId]/share-page-client.tsx` `seasonHeadingJa` | `/share/[shareId]` スナップショット | なし | 共有ボードの年＋期 | スナップショット固定 | 既存 URL 維持 |
| 期まとめ共有 | `app/share/season/[shareId]/page.tsx` | `/share/season/[shareId]` | なし | `seasonHeadingJa` | スナップショット固定 | 既存 URL 維持 |
| 今期チェック共有 | #779 は main にマージ済み。この base には未収録・禁止パス | — | — | — | — | 後述の rebase 手順 |
| seasonal API | `app/api/anime/seasonal/route.ts:15-45` | `year` + `season` / `all` | — | 応答の year/season | 欠落は現在期。不正は 400 | URL と応答を混ぜない |
| boards API | `app/api/boards/route.ts:18-19` | `year` + `season` 必須 | — | — | 不正は 400 | `parseSeasonYear` + `normalizeSeason` |
| statuses API | `app/api/statuses/route.ts` は期パラメータなし | 作品 JSON の season/seasonYear を保持 | — | — | 変換時に失わない | 変更なし |
| sitemap | `app/sitemap.ts:16-28` | `/seasons/{current,next}` | — | — | 今期・来期 | `getCurrentAnimeSeason` / `getNextAnimeSeason` |
| metadata | season landing `generateMetadata` canonical は path | `/seasons/YYYY/season` | — | `seasonLabelJa` / `SEASON_LABELS` | 既存 canonical | 小文字 path 維持 |
| native | `apps/native/src/lib/season.ts:3-24` が Web と同型の +9h 月判定のみ | ネイティブ画面ローカル state | `apps/native/src/app/index.tsx:28-30,308` 年＋期チップ。Explore は `explore.tsx:24-26` で年は `getFullYear()` | `SEASON_LABELS` | URL なし | **未共有**。後続 |

## native フォローアップ（この PR では UI を変えない）

- `apps/native/src/lib/season.ts` は境界判定だけ複製。parser / previous-next / ラベル / 年範囲がない。
- native Explore の `new Date().getFullYear()` はホストローカル年で、JST 正本と年越しでズレうる。
- 低リスク共有は、Web の `lib/season.ts` を native バンドルへコピーまたは workspace 共通化する作業。native UI 変更は別チケット。

## #779（今期チェック）rebase 手順

#779 はリリース済み。ローカル `origin/main` は `8c0d2c1`（PR #781）、この worktree の HEAD は `4d944ee`。ネットワーク取得・rebase は今回実施していない。impressions 実装をこの base にコピー／新規作成しない。

1. **#780 の本ブランチを、#779 を含む最新 main へ rebase** する。既存の未コミット差分を保持してから行う。共有ナビの二重追加はしない。
2. `app/tier/impressions/**` で query を `canonicalizeSeasonSearchParams` に通し、不正 query を正規化。独自 JST/月判定・parser を `getCurrentAnimeSeason` / `parseSeasonRef` に置き換える。
3. 編集ページに `SeasonContextControl` と `useSeasonUrlState` を接続する。API fetch・保存対象・ラベルには同じ `ref` を使い、前のリクエストの応答が次の期に表示されないようにする。暗黙今期と選択中の期を区別する。
4. `app/share/impressions/**` は share id に保存された年＋クールの**固定スナップショット**を維持する。`seasonHeadingJa` で表示し、編集用セレクタや現在期への自動切り替えは追加しない。
5. `app/api/season-impressions/**` は `parseSeasonYear` + `normalizeSeason` で不正を 400。欠落は今期。応答 year/season を URL/見出しと一致させる。`lib/season-impression*.ts` のキーを既存保存データと互換のまま正規化する。
6. `tests/season-impressions*` に JST 境界・年越し・不正 query・ラベル・共有スナップショット固定の検証を足す。
7. `tests/season-context.spec.ts` の `post-779 simple` / `post-779 visual` はルートファイルの存在で自動的に有効になる。Home の既存 Tier 枠を **1 タップ** → `/tier/impressions?year=2024&season=SUMMER` → 正しい active state・セレクタ → `Tier表` に同じ期で戻る、を両モードで通す。fixture が必要なら実際の #779 API 契約に合わせて追加し、アサーションは緩めない。
8. shared/source テスト、API/Tier 回帰、Playwright 全 browser spec、tsc、通常 build を再実行する。rebase 前の共有ナビ検証だけでは impressions 画面の統合完了とはしない。

禁止パス（触らない）: `app/tier/impressions/**`, `app/share/impressions/**`, `app/api/season-impressions/**`, `lib/season-impression*.ts`, `tests/season-impressions*`。

## corrective continuation: URL 同期とモバイル入口

- Grok の開始時差分をリポジトリ外へ退避して保持。ACK はメモリ上で検証し、成果物として保存しない。今回 commit / push / deploy / 外部ネットワーク通信は行わない。
- `pushState(window.history.state, ...)` は Next.js 16.3.2 の `__NA` / `_N` 判定で外部 history 更新の同期を回避する。`pushState(null, ...)` / `replaceState(null, ...)` に変更し、Next.js に内部状態の継承を任せる。
- URL 書き込みは `window.location`、連続操作の patch は最新 canonical context から組み立てる。遅延した `useSearchParams` の通知でも実 URL を再読込し、implicit-current の復元には初回 SSR の明示期を再利用しない。
- 過去期の Tier に現在期の SSR リストを seed しない。ゲスト Home の Tier 作成 CTA も選択期を渡す。
- ローカル `origin/main` の `MobileNav` / `GlobalNav` と既存 IA を確認。現在の runtime は `visual` / `simple`（旧 Pro 相当は visual）。両モードで同じ入口を使う。nav-v5 の既存 5 枠と旧 fallback の枠数・順序・owner gate は維持し、Tier 枠の行き先を `/tier/impressions` にする。常時表示ラベルは 1 行の `今期チェック`、アクセシブル名は `Tier 今期チェック`。6 番目の global tab は追加しない。
- `/tier` 以下では AppShell が `Tier表` / `今期チェック` の 44px 以上の切り替えを表示する。bottom nav は Tier family を active、エリア切り替えは pathname の完全一致のみ active。年＋クールを両方向に維持する。
- `tests/season-context.spec.ts` は同一イベント内の連続操作、両方向の履歴、他 query/hash の保持、表示作品とリンクの一致、375px の幅・タップ領域・両表示モードを検証する。固定 sleep、追加の待ち時間、既存アサーションの緩和は使わない。#779 の 2 件だけは未収録ルートを理由に明示 skip し、rebase 後に自動有効化する。
- 375px の実画面で見つかった nested grid の半幅化も修正。共通セレクタと前後ボタンを全列に配置し、幅 44px 以上・ラベルのはみ出しなしをブラウザで確認する。
- 全体実行の L8 で、ゲスト Home の年・クール選択と作品一覧が主操作を初期画面の下へ押し出す問題も検出した。ログイン・Tier 作成・使い方の操作を季節選択より前に配置し、季節選択との間に 24px の余白を確保する。

## ローカル検証（2026-10-02）

外部通信禁止に合わせ、Node の外部 fetch/socket を遮断し、Chromium の外部接続は loopback の拒否先プロキシへ向けた。DB は一時ディレクトリの SQLite、認証キーはダミー。既存 assertion / timeout / retry 設定は弱めていない。

証跡・開始時差分の保存先（リポジトリ外）: `C:/Users/Nobu/AppData/Local/Temp/atb780-grok-before-qgsshmgp/`。`initial.patch` と開始時ファイルのコピーを保持する。

| 検証 | 結果 / 証跡 |
|------|-------------|
| 修正前の実行 | Home で SUMMER 選択後も GlobalNav の href が FALL。追加した厳密な href assertion が失敗（`before-browser.log`） |
| #780 unit + source | 26 件成功。最終レイアウト修正後も toolbar source 2 件を含む **28/28** 成功（`unit-last.log`） |
| API / seasonal cache・snapshot / Home / Tier source / write-admission 回帰 | #780 を含む Node alias-loader の対象 143 件成功。最終コードでも再実行（`unit-complete.log`）。別途 Explore TSX resolver 30 件成功（`explore-unit.log`）。合計 **173/173** |
| #780 Playwright 全件 | **15 成功 / 2 skip**。後者は #779 の禁止ルートがまだないため。レイアウト修正後にも全件再実行（`season-final.log`）。最終画像は `final-season-results/` |
| #780 + Tier rating queue + toolbar、両ブラウザ | **54 成功 / 4 skip**（`tier-regression.log`）。skip は #779 の 2 ケース × 2 プロジェクト。既存 Tier queue 20 件と toolbar 4 件は全成功 |
| 既存モバイル回帰 + #780 ナビ | **9/9 成功**（`mobile-regression.log`）。L3 の nav flag 両設定、L4・L6・L7 と #780 の 4 モード設定。320 / 375 / 390 / 430px の文字折り返し・44px・ページ末尾の重なりを検証 |
| `/tier/impressions` の共有シェル | 最終追加の **4/4 成功**（`nav-final.log`）。Simple / visual × nav flag 両設定で active state と年・クールを検証。この base の本文は 404 のため、編集ページ自体の検証とは区別する |
| 最終 #780 全件 + ゲスト L8、両ブラウザ | **32 成功 / 4 skip / 0 失敗**（`layout-recheck.log`）。CTA 配置修正後に #780 の全 17 ケースと L8 を両プロジェクトで再実行。#779 の 2 ケース × 2 プロジェクトだけ skip。画像は `layout-recheck-results/` |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` exit 0（`tsc-last.log`）。生成ファイル復元後の最終コードを検査。ダウンロードを避けるためローカル CLI を使用 |
| 通常 build | 最終コードで `npm.cmd run build` exit 0（`build-last.log`）。型検査・52 static pages を含む |
| 差分・禁止ファイル | `git diff --check` 成功。開始時と同じ 30 ファイルのみ変更。UTF-8 / mojibake 検査成功。`AGENTS.md` / `next-env.d.ts` は開始時のバイト列へ復元。ACK artifact なし、#779 禁止パスは未変更 |

ブラウザ全体の通常コマンド `node node_modules/@playwright/test/cli.js test` は、既存設定が Node 用 `*.test.ts` まで収集し、ES module/require エラーで収集失敗した（`full-playwright.log`）。全 browser spec を漏れなく選ぶ `node node_modules/@playwright/test/cli.js test '\.spec\.ts$'` で、既存の chromium / mobile-chrome 両プロジェクトを完走した。**全 442 件: 338 成功 / 92 失敗 / 12 skip、exit 1、約 1 時間**（`full-browser-spec.log`）。skip は既存のデバイス限定 8 件と #779 統合待ち 4 件。テスト削除・既存 skip の追加・アサーション緩和はしていない。

全体実行中に判明したナビ・セレクタ・ゲスト Home の問題は修正し、対象テストを再実行した。以下の全体失敗件数は修正前を含む実測値であり、最終コードで全 442 件が成功したという意味ではない。

| 全体実行で失敗した spec | 件数 | 確認・再実行結果 |
|------|----:|------|
| `dashboard.spec.ts` | 10 | 旧見出し・旧 UI の期待と現行 owner gate が不一致。今回は変更していない |
| `explore-seasonal-freshness.spec.ts` | 1 | fresh 表示を単独で両ブラウザ再実行し **2/2 成功**（`explore-recheck.log`）。初回失敗の原因は未確定 |
| `lab-tier-reason.spec.ts` | 1 | pending 保存の観測で `saving` 期待に対し `saved`。未解決、対象実装は未変更 |
| `mobile-responsive.spec.ts` | 10 | ナビの折り返し等 5 件は修正後成功。ゲスト CTA 1 件も配置を修正し、L8 を両ブラウザ再実行して **2/2 成功**。残り 4 件は L9 / L10 × 両ブラウザで、季節 SSR の外部取得が `ATB780_OFFLINE` により失敗 |
| `tier-auth-handoff.spec.ts` | 37 | 引き継ぎ・recovery・保存など。未解決。下記の元 HEAD 比較は 5 ケースに限る |
| `tier-auth-return-guard.spec.ts` | 9 | `共有` と `共有をやめる` が一致する strict locator failure、および request / state の待機失敗など。未解決 |
| `tier-rating-queue.spec.ts` | 8 | クール選択肢の年表記が既存の年 locator と重複。選択肢を `（今期）` とし、既存テストを変えず両ブラウザ **20/20 成功** |
| `tier-share-intent.spec.ts` | 4 | 旧ゲスト共有文言・旧 `＋見たい` 操作への期待。未解決 |
| `watchlist.spec.ts` | 12 | 旧 `視聴管理` 見出しへの期待。未解決 |

**全体として合格とはしない。** 外部通信禁止に依存する検証と、未解決の認証・既存画面検証は別途調査が必要。今回の修正を根拠に一括して「既存問題」とは断定しない。

元 HEAD の比較は現在の worktree を変更せず `git archive HEAD` を一時ディレクトリへ展開した。認証引き継ぎの失敗 5 ケースは元 HEAD でも失敗（`baseline-browser.log`）。一時配置の依存リンクのため比較用サーバーは webpack / port 3781 を使用し、一部は失敗箇所も異なる。**全失敗が既存問題であるとの証明ではない**。Dashboard は今回未変更の owner gate と、旧 UI を期待する既存 spec が不一致。
