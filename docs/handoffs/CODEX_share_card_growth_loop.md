# Codex ハンドオフ — シェアカード成長ループ（Issue #258）

> 設計: `docs/features/share-card-growth-loop-20260629.md`
> このハンドオフだけで実装可能（コード探索不要）。日本語コメント・文字列は **UTF-8** で出力すること（mojibake 厳禁）。

## 1. 目的（ただ1つ）

シェアページから**リアクション(いいね等)を撤去**し、**コメントを日本語化して二次セクション化**し、**「自分のシェアカードを作る」CTA を共通部品化して獲得の主役に昇格**する。

## 2. 絶対制約（守らないと差し戻し）

- **バックエンド/API/DB は変更しない**。`/api/shares/[shareId]/reactions` ルート・`reactions` テーブル・`lib/shares.ts` の `ReactionKind`/`ReactionCounts` 型は**残置**（参照しなくなるだけ）。
- コメント機能（`/api/shares/[shareId]/comments`）は**残す**。読み公開・書きログインの挙動は現状維持。
- 既存のゲスト閲覧を壊さない。**新規にログインウォールを足さない**（原則6）。
- 触るのは下記「3. ファイル一覧」のみ。他ページ・他機能に波及させない。
- 日本語文字列は UTF-8。tsc/build を通す。

## 3. 作成/編集するファイル一覧

| ファイル | 操作 | 内容 |
|---------|------|------|
| `components/ShareCardCTA.tsx` | **新規** | 共通 CTA 部品 |
| `app/share/[shareId]/share-page-client.tsx` | 編集 | リアクション撤去・コメント日本語化・`ShareCardCTA` 使用 |
| `app/share/season/[shareId]/season-share-client.tsx` | 編集 | footer の手書き CTA を `ShareCardCTA` に置換 |
| `app/globals.css` | 編集 | `.share-card-cta` 系スタイル（既存 `.share-page-cta`/`.season-share-footer` を流用/改名でも可） |
| `app/updates/page.tsx` | 編集 | RELEASES 追記（`isLatest: true`） |

## 4. データ契約（探索不要）

- `components/ShareCardCTA.tsx` の props:
  ```ts
  export function ShareCardCTA({
    headline,   // 価値コピー（例「あなたも今期のアニメを Tier 表にして布教しよう」）
    buttonLabel,// 例「自分の Tier 表を作る」
    href        // 遷移先（例 "/tier?from=share"）
  }: { headline: string; buttonLabel: string; href: string }): JSX.Element
  ```
  - `next/link` の `<Link>` を使う。`className="command-button emphasis-button"` を踏襲。
- コメント日本語化の対応表:
  | 現状(英語) | 置換後 |
  |---|---|
  | `Comments`（見出し h2） | `コメント` |
  | `No comments yet.` | `まだコメントはありません。` |
  | `Write a comment...`（placeholder） | `感想を書く…` |
  | `Post`（ボタン） | `投稿` |
  | `Google login to comment` | `Google ログインしてコメント` |
  | `Signed in as {name}` | `{name} としてログイン中` |
  | `"Google user"`（fallback 名） | `名無しさん` |

## 5. 実装仕様

### 5.1 `components/ShareCardCTA.tsx`（新規）
- `"use client"` 不要（純表示）。上記 props を受けて、`headline` の `<p>` ＋ `<Link href={href} className="command-button emphasis-button">{buttonLabel}</Link>` を `<section className="share-card-cta">` で囲む。

### 5.2 `app/share/[shareId]/share-page-client.tsx`（編集）
- **撤去**: `reactionOptions` 配列、`handleReaction`、`reactingKind`/`reactionCounts`/`viewerReactions` の state と関連 `useEffect`、ヘッダー内 `share-actions`（リアクションボタン群）、`initialViewerReactions` prop と import（`Heart`/`ThumbsUp`/`Zap`/`Sparkles`）。`BoardShare.reactionCounts` は参照しないだけ（型は触らない）。
  - ※ `page.tsx`（server）側で `initialViewerReactions` を渡している場合は、渡す側も削除して tsc を通す。
- **コメント**: 上記対応表どおり日本語化。`comment-panel` セクションは CTA の**下**に移動（または現状位置のままでも可だが、CTA を card 直後に置く）。
- **CTA**: 末尾の手書き `share-page-cta`（「あなたも numanie で…」）を撤去し、
  `<ShareCardCTA headline="あなたも今期のアニメを Tier 表にして布教しよう" buttonLabel="自分の Tier 表を作る" href="/tier?from=share" />`
  を **card セクションの直後・コメントの前** に配置。

### 5.3 `app/share/season/[shareId]/season-share-client.tsx`（編集）
- 末尾 `season-share-footer`（「あなたも今期のアニメをまとめて布教しませんか？」＋「numanie で作る」）を
  `<ShareCardCTA headline="あなたも今期の沼をまとめて共有しよう" buttonLabel="自分のシェアカードを作る" href="/lab/promote?from=season-share" />`
  に置換。`label`/`comment`/`items` の表示はそのまま。

### 5.4 `app/globals.css`
- `.share-card-cta` を追加（既存 `.share-page-cta` / `.season-share-footer` の見た目を流用しつつ、中央寄せ・余白・目立つボタンで「主役」感を出す）。撤去したリアクション関連 CSS（`.reaction-button` 等）は他で未使用なら削除可、判断つかなければ残置。

### 5.5 `app/updates/page.tsx`
- RELEASES 配列の先頭に新バージョン追記、`isLatest: true`。旧最新は `isLatest` を外す。内容例: 「シェアページを刷新: いいねを廃止し、コメントと『自分のシェアカードを作る』導線に集約」。

## 6. 受け入れ条件（完了の定義）

- `/share/[shareId]` にリアクションボタンが無く、日本語コメントと新 CTA が表示される。
- `/share/season/[shareId]` に新 CTA が表示される。
- 未ログインでも両ページが閲覧でき、新たなログインウォールが無い。
- `npx tsc --noEmit` 通過 / `npm run build` 通過。
- `app/updates` に最新リリース追記。

## 7. スコープ外（やらない）

- リアクション API/テーブルの物理削除。
- 期まとめシェアへのコメント機能追加。
- 匿名コメント化。CTA の sticky bar・計測イベント集計。

## 8. 起動メモ（オペレーター用）

- worktree を origin/main から作成。ブランチ例 `feat/share-card-growth-loop`。
- Codex には短い ASCII 指示＋本ファイルパスを渡す（日本語長文を端末に直接打たせない）。
- 受領後: `git diff` で mojibake 検査・スコープ逸脱チェック → Claude が tsc/build 検収。
