# PR #135 (Issue #123) — Claude Code レビュー指摘 (2026-06-20)

対象ブランチ: PR #135 のブランチ (issue-123-native-auth-redesign)
レビュアー: Claude Code

Codex の以前の実装(`NATIVE_AUTH_SECRET` 分離、`native_sessions` による失効管理、Google `tokeninfo` のfail-closed検証など)はレビュー済みで、主要な指摘は解消されていることを確認した。残っている指摘は以下の2点。いずれもサーバー側(`lib/api/native-auth.ts`, `lib/native-sessions.ts`, `app/api/auth/native/route.ts`, `auth.ts`)には変更不要で、`apps/native` 側のクライアントコードのみが対象。

## 修正必須: 本番ビルドでHTTPSでないAPI_BASEを許容してしまう

対象: `apps/native/src/lib/api-base.ts`

現在の実装は次の通り:

```ts
const isLocalDevHost = API_BASE === DEV_FALLBACK_BASE;

if (!isLocalDevHost && !API_BASE.startsWith('https://')) {
  // 本番/実機向けの設定ミスを早期発見するための警告（処理は継続する）。
  console.warn(
    `EXPO_PUBLIC_API_BASE が HTTPS ではありません: ${API_BASE}。Bearer token が平文で送信される可能性があります。`
  );
}
```

`EXPO_PUBLIC_API_BASE` がローカル開発用フォールバック以外で、かつ `https://` で始まらない場合、`console.warn` のみで処理を継続してしまう。native認証のBearerトークン(`native_sessions` による長命のセッショントークン)が平文HTTPで送信され得る設定ミスを、警告だけで黙って許容するのは fail-open であり、#123 の他の修正(fail-closedなGoogle tokeninfo検証など)の方針と矛盾する。

### 修正方針
ローカル開発用フォールバック(`isLocalDevHost === true`)の場合は現状通り許容する。それ以外で `https://` 始まりでない場合は、`console.warn` ではなく例外を投げてアプリの起動/APIクライアント初期化を失敗させること(fail-closed)。エラーメッセージは現行の日本語メッセージを流用してよい。

## 修正推奨: レスポンス型キャストにランタイム検証が無い

対象: `apps/native/src/lib/auth-api.ts`

- `exchangeGoogleIdToken` (15-37行目) と `exchangeDevSession` (39-65行目): `return payload as ExchangeResponse;` で、`payload.token` / `payload.user` の型・存在を検証せずにキャストしている。サーバーが想定外のレスポンスを返した場合、`token` が `undefined` のまま `setStoredSessionToken` に渡り、後続の認証状態が壊れたまま気づかれない可能性がある。
- `fetchCurrentUser` (67-92行目): `const payload = (await response.json()) as { user: AuthUser };` も同様に未検証。

### 修正方針
3箇所とも、キャストの前に最低限のランタイムチェック(例: `typeof payload?.token === 'string'` および `payload?.user` が object であること)を追加し、不正な形であれば明確なエラーを `throw new Error(...)` すること。大掛かりなスキーマライブラリの導入は不要、簡単な型ガード関数で十分。

## 触ってはいけない箇所
- `lib/api/native-auth.ts`, `lib/native-sessions.ts`, `app/api/auth/native/route.ts`, `auth.ts` のサーバー側実装は変更不要。

## 検証手順
修正後、このworktree内で以下を実行して結果を確認すること:
- `npx tsc --noEmit` (リポジトリルート)
- `npx tsc --noEmit` (apps/native ディレクトリ内)
- `npm run build` (リポジトリルート)

すべて成功したら、変更をコミットして既存ブランチに push すること(PR #135 は既にopenなので追加コミットがそのまま反映される)。
**マージは絶対に行わないこと。**
完了したら PR #135 にコメントで修正内容を要約すること。
