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
