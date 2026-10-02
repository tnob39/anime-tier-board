# Anime Tier Board

AniList/Jikan から季節アニメを取得し、Tier 表を作る Next.js アプリです。

## 主な機能

- 季節アニメの取得
- ドラッグ&ドロップで Tier 表を編集
- スマホ向けのタップ移動メニュー
- Tier 表内カードは画像のみ表示
- 未分類プールではタイトル・評価・配信リンクを表示
- Google 認証
- Turso への自動保存
- 共有 URL 作成
- 共有ページでのいいね
- PNG 出力

## ローカル起動

```powershell
npm.cmd install
npm.cmd run dev:local
```

または:

```powershell
start-local.cmd
```

ローカル URL:

```text
http://localhost:3000
```

Google OAuth のローカル callback:

```text
http://localhost:3000/api/auth/callback/google
```

## 環境変数

`.env.local` に以下を設定します。

```env
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
AUTH_URL=
AUTH_TRUST_HOST=true
```

ローカルだけで動かす場合、`AUTH_URL` は未設定でも動きます。Vercel ではデプロイ先 URL を設定します。

現在の Vercel preview URL:

```text
https://anime-tier-board-74zcixibh-tnob39s-projects.vercel.app
```

Vercel 用:

```env
AUTH_URL=https://anime-tier-board-74zcixibh-tnob39s-projects.vercel.app
AUTH_TRUST_HOST=true
```

## Google OAuth 設定

Google Cloud Console の OAuth クライアントに以下を登録します。

Authorized JavaScript origins:

```text
http://localhost:3000
https://anime-tier-board-74zcixibh-tnob39s-projects.vercel.app
```

Authorized redirect URIs:

```text
http://localhost:3000/api/auth/callback/google
https://anime-tier-board-74zcixibh-tnob39s-projects.vercel.app/api/auth/callback/google
```

## Turso

Turso は以下に使っています。

- ログインユーザーごとの Tier 表自動保存
- 共有 URL 用の Tier 表スナップショット
- 共有ページのいいね

利用する env:

```env
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
```

DB テーブルはリクエスト時に自動作成されます。

- `tier_boards`
- `board_shares`
- `share_reactions`

## ビルド確認

```powershell
npm.cmd run build
```

## 今期チェックのテスト（Issue #779）

Node.js 24 と、`npm.cmd ci` で導入するプロジェクトの依存パッケージを使用します。
ブラウザテストには Playwright の Chromium が必要です。未導入の場合のみ、ネットワークを利用できる環境で一度セットアップしてください。

```powershell
npm.cmd exec -- playwright install chromium
```

```powershell
npm.cmd run test:season-impressions
npm.cmd run test:season-impressions:browser
npm.cmd run test:season-impressions:e2e
npx.cmd tsc --noEmit
npm.cmd run build
```

- `test:season-impressions`: 一時的なローカル libSQL DB で保存・認可・共有・削除を検証し、実際の公開ページを読み込んで HTML・metadata・公開停止後の 404 も検証します。`tests/alias-loader.mjs` がエイリアス解決と宣言済み TypeScript による TSX 変換を行います。Node では CSS import のみを空モジュールとして扱います。
- `test:season-impressions:browser`: 宣言済み Next.js に同梱された webpack と `tests/impressions-tsx-loader.cjs` で実コンポーネントをバンドルし、実 CSS とともに Chromium 上で検証します。`tests/impressions-browser-entry.tsx` は認証・ルーティングの代替を提供し、API・画像などのリクエストは Playwright がすべてローカルで応答または遮断します。開発サーバー・外部 API・認証情報は不要です。バンドルとスクリーンショットは Git 対象外の `test-results/impressions-offline/` に出力します。

- `test:season-impressions:e2e`: 標準 Playwright spec (`tests/season-impressions.spec.ts`) を、実際の Next App Router / NextAuth の未ログイン session / API routes に対して実行します。専用設定は localhost:3179 で Next を起動し、既存 global setup の JWT 生成・リモート DB 操作を使用しません。季節作品一覧だけ固定応答とし、外部 URL は遮断します。認証・今期チェック・共有 API の応答はモックしません。desktop と 375px で入力・クール遷移・未ログイン拒否・私的下書きの非表示を検証します。

browser テストは認証・API を置換したコンポーネント回帰テストであり、本番 E2E の証拠ではありません。上記 E2E もローカルの未ログイン境界の証拠です。Google OAuth の往復、実 session の失効、A→B→A の切り替え、認証済みの保存・削除・再読み込み後の再作成・共有は、デプロイ後に Hermes が preview/production の実認証で確認します。OAuth を偽装して成功扱いにはしません。

下書きは sessionStorage に30分保持し、認証済み入力はユーザーID・クール別に保存します。ゲスト入力は明示ログインの return token が一致した場合だけ取得し、その場でログイン先へ拘束して token の下書きを消費します。所有者不明の旧 v1 は復元しません。一言本文を URL に入れません。削除済み記録の再作成は所有者専用 GET の `deletedRevisions` または DELETE の `cursor` にある現在 revision を必要とし、`revision: 0` は未作成の行だけに有効です。

テストに追加の `NODE_OPTIONS` や未宣言のローダーは不要です。ビルドは通常の `next build` を実行し、`next-env.d.ts` の生成を妨げません。生成ファイルの変更がタスク対象外の場合は、検証後にそのファイルを検証前の状態に戻してください。

## Vercel デプロイ

Vercel 側の Environment Variables に `.env.local` と同じキーを設定してから実行します。

```powershell
npx.cmd --yes --cache C:\Users\Nobu\.claude\tmp\npm-cache vercel@latest deploy -y
```

Codex 実行環境からは Vercel への HTTPS 接続が制限されることがあるため、その場合はユーザー側 PowerShell で実行してください。

## 操作メモ

スマホではカードをタップすると下部に移動メニューが出ます。移動先 Tier を選ぶだけでカードを移動できます。ドラッグ操作も残しています。
## Current MVP Scope

- Google login gates remote save, share creation, shared reactions, comments, and viewing-status saves.
- Turso stores saved boards, share snapshots, share comments, reactions, and per-user anime viewing statuses.
- Shared pages under `/share/[shareId]` support flat comments and one reaction per signed-in user.
- Anime cards can save viewing status. The saved status includes an anime metadata snapshot for later analytics.
- `/dashboard` aggregates status counts, genre bias, studio bias, and voice-actor bias.
- `DESIGN.md` documents the mobile-first design direction for the next visual pass.
