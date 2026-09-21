# 公開 write API 保護（Issue #741）

S1（PR #750）は comments POST の same-origin と decode 前 4KiB 上限。
S2 は共有の fail-closed 受付境界を公開 write に横断適用する。Issue 全体の完了ではない。

## Trusted proxy 前提（推測しない）

本番は Vercel のみを trusted proxy とする。

| `WRITE_TRUSTED_PROXY` | 使うヘッダ | 使わないもの |
|---|---|---|
| `vercel` | 単一値の `x-vercel-forwarded-for`。無ければ単一値の `x-real-ip` | `x-forwarded-for`（クライアントが前置できる）、カンマ区切り、複数ヘッダ、未知 CDN |
| `test` | 非本番のみ。単一値の `x-test-client-ip` | `NODE_ENV=production` では値ごと拒否（未設定と同じ） |
| 未設定 / 未知 / 本番の `test` | 認証済みは `user:` キーのみ。匿名・IP 必須は本番 503 | 共有匿名キーへのフォールバック |

未知のプロキシ製品名は実装しない。Cloudflare 等へ移す場合は値とヘッダを明示してから足す。

## レート制限キー

- 認証済み: `policy:user:<userId>`。IP が取れれば `policy:ip:<ip>` も独立に検査する。
- 匿名（feedback / native auth 交換）: IP 必須。本番で proxy 未設定は 503。
- 識別子は 128 文字まで。超過は 403。バケットを作らない。
- 識別不能（不正ヘッダ）: 403。全員を同じキーにまとめない。
- 消費は preflight のあと一括。IP 上限で user カウンタは増えない。
- 満杯時は期限切れだけ削除する。active を FIFO 退去させず 503。

実装はプロセス内 Map。Vercel isolate を跨ぐ耐久カウンタは残ギャップ（新規インフラ禁止のため未導入）。

## 本文上限（decode 前）

`readJsonWithByteLimit` / `readFormDataWithByteLimit`。Content-Length 超過は body 未読で 413。chunked / 欠落 / 過少申告は累積して超過時 cancel。UTF-8 fatal・JSON 不正は 400。

| 経路 | 上限 |
|---|---|
| comments / reactions | 4 KiB |
| evangelist / season share / account / native auth | 8 KiB |
| subscriptions / push | 8 KiB |
| status PATCH | 8 KiB |
| watchlist PUT | 20 KiB |
| statuses PUT | 80 KiB |
| boards PUT | 300 KiB |
| board share POST | 800 KiB |
| feedback multipart | `FEEDBACK_MULTIPART_MAX_BYTES`。CL 欠落でも累積 cap のあと formData |

## 境界（auth / CSRF / origin / idempotency）

| 種別 | 認証 | Origin | Idempotency |
|---|---|---|---|
| comments / reactions / shares / season / evangelist / dashboard share / watchlist share | session `auth()` | `request.url.origin` 完全一致 | 任意 `Idempotency-Key` は形式検証のみ。永続 replay なし |
| statuses / watchlist / boards / subscriptions / account / push | `requireWriteIdentity()` | **session のみ** same-origin。**有効 Bearer は Origin 不要** | boards / status PATCH は `expectedUpdatedAt` OCC |
| feedback | なし（匿名） | feedback 専用 origin allowlist | GitHub marker による cron 側冪等 |
| `/api/auth/native` POST | Google idToken / devMode | 要求しない | なし |
| cron | `Authorization: Bearer CRON_SECRET`（未設定は拒否） | 対象外 | 対象外 |
| debug | `devOnlyRouteGuard` | 対象外 | 対象外 |

Cookie 付きブラウザ write に same-origin を足しても、検証済み Bearer 経路の auth は弱めない。

## エラー契約

公開 write の abuse 応答は `{ "error": "<日本語>" }`。

| 状態 | status | 本文 | 追加 |
|---|---|---|---|
| 過大 | 413 | リクエストが大きすぎます。 | |
| 形式不正 | 400 | リクエストの形式が不正です。 | |
| origin 拒否 | 403 | この送信元からのリクエストは許可されていません。 | |
| レート制限 | 429 | リクエストが多すぎます。しばらくしてから再度お試しください。 | `Retry-After` 秒 |
| IP 識別不能 / 過長キー | 403 | リクエストを識別できません。 | |
| 本番 proxy 未設定（IP 必須） | 503 | この環境ではリクエストを受け付けられません。 | |
| バケット満杯 | 503 | 現在リクエストを受け付けられません。 | |

既存の 401 `Unauthorized` / ドメイン検証メッセージは互換のため残す。

## 画像プロキシ / アップロード

`/api/image-proxy` は **base `d09bfbd` のまま**。標準 `fetch` は事前 DNS 結果を接続先に束ねられないため、S2 は SSRF 安全を主張しない。DNS-bound egress（接続先を解決済みアドレスに固定する）は残ギャップ。undeclared な undici/カスタムネットは導入しない。

- `/api/go/[serviceId]`: サーバー側 `STREAMING_SERVICES` 固定 URL のみ。`to=` なし。
- feedback 画像: Vercel Blob。multipart は decode 前に累積 byte cap。元ファイル名は保存しない。

## コメント moderation / 削除 / 通報

コード:

- 投稿者本人: `DELETE /api/shares/:shareId/comments?commentId=`（same-origin + 認証 + レート制限）。`user_id` 一致のみ。他人のコメントは 404。

運用（スキーマ変更なし）:

1. 通報受付: 公開 `/feedback`（匿名）または GitHub Issue。コメント URL と `commentId` を本文に含める。
2. 投稿者削除: 上記 DELETE。UI は未配線（`app/**/*.tsx` 禁止のため S2 対象外）。
3. オーナー / 運用者の非表示: `hidden` 列は無い。Turso で対象行を削除する。

```sql
SELECT comment_id, share_id, user_id, body, created_at
FROM share_comments
WHERE comment_id = ?;

DELETE FROM share_comments
WHERE comment_id = ? AND share_id = ?;
```

4. 共有自体の撤去: `board_shares` / watchlist / dashboard share 行の削除はデータ破壊になるため、Issue 単位で確認してから実行する。
5. 通報の永続テーブル・自動 hide は未実装（残ギャップ）。

## 本番 config / runbook

Vercel Project Settings に既存必須変数に加えて設定する:

```env
WRITE_TRUSTED_PROXY=vercel
```

手順:

1. Preview / Production の両方に `WRITE_TRUSTED_PROXY=vercel` を入れる。`test` は Production で無視され、未設定と同じ。未設定のまま Production に出すと feedback / native auth が 503 になる（fail-closed）。
2. デプロイ後、正規 origin から comments POST が 200、別 origin が 403 であることを確認する。
3. cookie session の `/api/statuses` PUT は Origin なしで 403、有効 Bearer は Origin なしで通ることを確認する。
4. 同一ユーザーで comments を 11 回送り、11 回目が 429 かつ `Retry-After` が付くことを確認する。
5. isolate 再起動で in-memory カウンタはリセットされる。持続的な ban が必要なら後続で耐久ストアを入れる。

ローカル:

- 認証済み write は IP なしでも `user:` キーで動く。
- 匿名経路は `NODE_ENV !== production` のとき `ip:dev-local`。非本番の確認は `WRITE_TRUSTED_PROXY=test` と `x-test-client-ip` を使う。

## 残ギャップ

| 項目 | 理由 | 次の安全な原子単位 |
|---|---|---|
| isolate 横断の耐久レート制限 | Redis/KV 等の新規インフラ禁止 | 許可されたストアを導入してから Map を置換 |
| コメント通報テーブル / 自動 hide | スキーマ変更禁止 | `share_comments.hidden_at` と report テーブル |
| 共有オーナーによる他人コメント削除 | `lib/shares.ts` が許可外。UI も禁止 | shares helper + 共有ページ操作 |
| コメント削除 UI | `app/**/*.tsx` 禁止 | 共有ページに本人削除ボタン |
| `/api/image-proxy` の DNS-bound egress | 標準 fetch では事前 DNS を接続に束ねられない。undici 追加は禁止 | 許可されたソケット固定のあと、stream-cap / SVG 禁止 / nosniff |
| GET `/api/anime/seasonal` レート制限 | 本 Issue は write | 読み取り専用スライス |
| GET evangelist card の view カウント | GET 副作用 | 別スライス |
| native auth の audience fail-closed | `native-auth.ts` の検証強化は本スライス外 | 既存 #123 追跡 |
| Idempotency-Key の応答 replay | 耐久ストアなし | 許可ストア導入後 |

Issue #741 を close するには上表の耐久レート制限、moderation 永続化、DNS-bound proxy egress が残る。
